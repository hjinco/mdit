import {
	getFileNameWithoutExtension,
	hasPathConflictWithLockedPaths,
	isPathEqualOrDescendant,
} from "@mdit/utils/path-utils"
import { relative, resolve } from "pathe"
import { createState } from "../create-state"
import {
	appendHistoryEntry,
	createTabSelections,
	getHistoryNavigationTarget,
	initialHistory,
	removePathsFromHistory as pruneHistory,
	rememberSelection,
	replaceHistoryPath,
} from "./history"
import {
	selectActiveTab,
	selectActiveTabPath,
	selectDocumentById,
} from "./selectors"
import { createDocumentSessions } from "./sessions"
import type {
	DiskDocument,
	DocumentSnapshotProvider,
	DocumentsSnapshot,
	DocumentWorkspaceDependencies,
	OpenDocument,
	OpenDocumentSnapshot,
	Tab,
} from "./types"

type OpenTabOptions = {
	initialSelection?: "title"
	skipSelectionCapture?: boolean
}

type ExternalContentOptions = {
	preserveSelection?: boolean
	revision?: string
	isCurrent?: () => boolean
}

const emptySnapshot: DocumentsSnapshot = {
	tabs: [],
	openDocuments: [],
	activeTabId: null,
}

const MAX_HISTORY_LENGTH = 50
const MAX_PERSISTED_FILES = 5

const supportsDocument = (path: string) => /\.(md|markdown)$/i.test(path)

const pathIsUnder = (path: string, parents: string[]) =>
	parents.some((parent) => isPathEqualOrDescendant(path, parent))

const tabAfterRemoval = (tabs: Tab[], removedIndex: number) =>
	tabs[Math.min(tabs.length - 1, Math.max(0, removedIndex - 1))]?.id ?? null

export function createDocumentWorkspace(deps: DocumentWorkspaceDependencies) {
	const { getSnapshot, subscribe, update } =
		createState<DocumentsSnapshot>(emptySnapshot)
	const selections = createTabSelections()
	const pendingRemaps = new Map<number, Promise<void>>()
	const renameDestinations = new Map<string, string>()
	let nextDocumentId = 0
	let nextTabId = 0
	let navigation = 0
	let generation = 0
	let persistQueue = Promise.resolve()

	const getTab = (id: number | null) =>
		getSnapshot().tabs.find((tab) => tab.id === id)
	const getDocument = (id: number) =>
		getSnapshot().openDocuments.find((document) => document.id === id)
	const documentAt = (path: string) =>
		getSnapshot().openDocuments.find((document) => document.path === path)
	const isReservedDestination = (path: string) =>
		pathIsUnder(path, [...renameDestinations.keys()])

	const hasRenameCollision = (oldPath: string, newPath: string) =>
		getSnapshot().openDocuments.some(
			({ path }) =>
				isPathEqualOrDescendant(path, newPath) &&
				!isPathEqualOrDescendant(path, oldPath),
		)

	const hasPendingRename = (oldPath: string, newPath: string) =>
		hasPathConflictWithLockedPaths(
			[oldPath, newPath],
			[...renameDestinations.keys()],
		)

	const reserveDocumentRename = (oldPath: string, newPath: string) => {
		if (hasRenameCollision(oldPath, newPath)) {
			throw new Error("Close the open note at the destination before renaming.")
		}
		if (hasPendingRename(oldPath, newPath)) {
			throw new Error("Another rename is in progress at this path.")
		}
		renameDestinations.set(newPath, oldPath)
		return () => renameDestinations.delete(newPath)
	}

	const persistOpenTabs = () => {
		const workspacePath = deps.getWorkspacePath()
		if (!workspacePath) {
			return Promise.resolve()
		}

		const { tabs, activeTabId } = getSnapshot()
		const ordered = tabs.filter((tab) => tab.id !== activeTabId)
		const active = tabs.find((tab) => tab.id === activeTabId)
		if (active) {
			ordered.push(active)
		}
		const paths = ordered
			.flatMap((tab) => {
				const document = getDocument(tab.documentId)
				return document && isPathEqualOrDescendant(document.path, workspacePath)
					? [relative(workspacePath, document.path)]
					: []
			})
			.slice(-MAX_PERSISTED_FILES)

		persistQueue = persistQueue
			.then(() => deps.saveLastOpenedFiles(workspacePath, paths))
			.catch((error) => console.error("Failed to persist open notes:", error))
		return persistQueue
	}

	const replaceLayout = (
		tabs: Tab[],
		openDocuments: OpenDocument[],
		activeTabId: number | null,
	) => {
		const prior = getSnapshot()
		const tabIds = new Set(tabs.map((tab) => tab.id))
		const documentIds = new Set(tabs.map((tab) => tab.documentId))
		for (const tab of prior.tabs) {
			if (!tabIds.has(tab.id)) {
				selections.clear(tab.id)
			}
		}
		for (const document of prior.openDocuments) {
			if (!documentIds.has(document.id)) {
				sessions.delete(document.id)
			}
		}
		update({
			tabs,
			openDocuments: openDocuments.filter((document) =>
				documentIds.has(document.id),
			),
			activeTabId,
		})
	}

	const updateDocument = (
		id: number,
		apply: (document: OpenDocument) => OpenDocument,
	) => {
		const { openDocuments } = getSnapshot()
		const index = openDocuments.findIndex((document) => document.id === id)
		if (index < 0) {
			return
		}
		const document = apply(openDocuments[index])
		if (openDocuments[index] !== document) {
			const documents = [...openDocuments]
			documents[index] = document
			update({ openDocuments: documents })
		}
	}

	const remapPaths = (oldPath: string, newPath: string, revision?: string) => {
		if (oldPath === newPath) {
			return
		}
		const state = getSnapshot()
		const openDocuments = state.openDocuments.map((document) => {
			if (!isPathEqualOrDescendant(document.path, oldPath)) {
				return document
			}
			const path =
				document.path === oldPath
					? newPath
					: resolve(newPath, relative(oldPath, document.path))
			return {
				...document,
				path,
				name: getFileNameWithoutExtension(path) ?? document.name,
				diskRevision:
					document.path === oldPath && revision !== undefined
						? revision
						: document.diskRevision,
			}
		})
		const tabs = state.tabs.map((tab) => ({
			...tab,
			history: replaceHistoryPath(tab.history, oldPath, newPath),
		}))
		update({ openDocuments, tabs })
		void persistOpenTabs()
	}

	const sessions = createDocumentSessions({
		deps,
		getDocument,
		updateDocument,
		remap: remapPaths,
		reserveRename: reserveDocumentRename,
		waitForRemap: (id) => pendingRemaps.get(id),
	})

	const loadDocument = async (path: string): Promise<OpenDocument | null> => {
		const name = getFileNameWithoutExtension(path)
		const disk = name && (await deps.readDocument(path))
		return disk
			? {
					id: ++nextDocumentId,
					path,
					name,
					content: disk.content,
					diskRevision: disk.revision,
					sessionEpoch: 0,
					isSaved: true,
				}
			: null
	}

	const createTab = (document: OpenDocument): Tab => ({
		id: ++nextTabId,
		documentId: document.id,
		...initialHistory(document.path),
	})

	const saveActiveSelection = () => {
		const state = getSnapshot()
		const tab = getTab(state.activeTabId)
		if (!tab) {
			return
		}
		const next = rememberSelection(tab, selections.read(tab.id))
		if (next !== tab) {
			update({
				tabs: state.tabs.map((current) =>
					current.id === tab.id ? next : current,
				),
			})
		}
	}

	const queueTitleSelection = (
		tab: Tab,
		document: OpenDocument,
		options?: OpenTabOptions,
	) => {
		if (options?.initialSelection === "title") {
			selections.queue(tab.id, document.path, {
				anchor: { path: [0, 0], offset: 0 },
				focus: { path: [0, 0], offset: document.name.length },
			})
		}
	}

	const lastReference = (id: number) =>
		getSnapshot().tabs.filter((tab) => tab.documentId === id).length === 1

	const flushDocuments = async (matches: (doc: OpenDocument) => boolean) => {
		for (;;) {
			const pending = getSnapshot().openDocuments.filter(
				(doc) => matches(doc) && !doc.isSaved,
			)
			if (pending.length === 0) {
				return true
			}
			const saved = await Promise.all(
				pending.map((doc) => sessions.get(doc.id)?.flush()),
			)
			if (saved.some((didSave) => !didSave)) {
				return false
			}
		}
	}

	const appendTab = async (
		path: string,
		request: number,
		options?: OpenTabOptions,
		preloaded?: OpenDocument,
	) => {
		const workspaceGeneration = generation
		const loaded = documentAt(path) ?? preloaded ?? (await loadDocument(path))
		const current = documentAt(path)
		if (
			!loaded ||
			workspaceGeneration !== generation ||
			(!current && isReservedDestination(path))
		) {
			return
		}
		const document = current ?? loaded
		const tab = createTab(document)
		const state = getSnapshot()
		queueTitleSelection(tab, document, options)
		replaceLayout(
			[...state.tabs, tab],
			current ? state.openDocuments : [...state.openDocuments, document],
			request === navigation || state.activeTabId === null
				? tab.id
				: state.activeTabId,
		)
		await persistOpenTabs()
	}

	const loadIntoTab = async (
		tab: Tab,
		path: string,
		request: number,
		visit: (current: Tab) => Tab,
		queueSelection: (document: OpenDocument) => void,
		force = false,
	) => {
		const isCurrent = () =>
			request === navigation &&
			getSnapshot().activeTabId === tab.id &&
			getTab(tab.id)?.documentId === tab.documentId
		const losesLastDraft = () =>
			getDocument(tab.documentId)?.path !== path &&
			lastReference(tab.documentId) &&
			!getDocument(tab.documentId)?.isSaved

		let existing = documentAt(path)
		let loaded = !existing || force ? await loadDocument(path) : null
		while (isCurrent() && (existing || loaded) && losesLastDraft()) {
			if (!(await sessions.get(tab.documentId)?.flush()) || !isCurrent()) {
				return false
			}
			// The watcher cannot refresh a destination that has not been opened yet.
			existing = documentAt(path)
			loaded = !existing || force ? await loadDocument(path) : null
		}
		if (!isCurrent()) {
			return false
		}

		const state = getSnapshot()
		const target = documentAt(path)
		const currentTab = getTab(tab.id)
		if (!currentTab || (!target && (!loaded || isReservedDestination(path)))) {
			return false
		}
		const document = target ?? loaded!
		const next = { ...visit(currentTab), documentId: document.id }
		queueSelection(document)
		replaceLayout(
			state.tabs.map((current) => (current.id === tab.id ? next : current)),
			target ? state.openDocuments : [...state.openDocuments, document],
			tab.id,
		)
		if (target === existing && target?.isSaved && loaded && force) {
			applyDiskSnapshot(
				target,
				{ content: loaded.content, revision: loaded.diskRevision },
				true,
			)
		}
		await persistOpenTabs()
		return true
	}

	const applyDiskSnapshot = (
		document: OpenDocument,
		disk: DiskDocument,
		preserveSelection: boolean,
		isPathRemap = false,
	) => {
		if (sessions.isPendingWrite(document.id, document.path, disk.content)) {
			return
		}
		if (document.content === disk.content && !document.conflict) {
			if (
				(document.isSaved || isPathRemap) &&
				document.diskRevision !== disk.revision
			) {
				updateDocument(document.id, (current) => ({
					...current,
					diskRevision: disk.revision,
				}))
			}
			return
		}
		if (!document.isSaved) {
			sessions.conflict(document.id, { type: "changed", content: disk.content })
			return
		}

		const tab = getTab(getSnapshot().activeTabId)
		if (preserveSelection && tab?.documentId === document.id) {
			const selection = selections.read(tab.id)
			saveActiveSelection()
			selections.queue(tab.id, document.path, selection)
		}
		updateDocument(document.id, (current) => ({
			...current,
			content: disk.content,
			diskRevision: disk.revision,
			sessionEpoch: current.sessionEpoch + 1,
		}))
	}

	const refreshTabFromExternalContent = async (
		path: string,
		content: string,
		options?: ExternalContentOptions,
	) => {
		const current = documentAt(path)
		const isCurrent = options?.isCurrent ?? (() => true)
		if (
			!current ||
			!isCurrent() ||
			sessions.isPendingWrite(current.id, path, content)
		) {
			return
		}

		const disk =
			options?.revision !== undefined
				? { content, revision: options.revision }
				: await deps.readDocument(path)
		const latest = documentAt(path)
		if (!disk || !isCurrent() || latest?.id !== current.id) {
			return
		}
		if (latest.diskRevision !== current.diskRevision) {
			return
		}
		applyDiskSnapshot(latest, disk, options?.preserveSelection ?? false)
	}

	const renameTab = (oldPath: string, newPath: string): Promise<void> => {
		if (oldPath === newPath) {
			return Promise.resolve()
		}
		const moved = getSnapshot().openDocuments.filter((document) =>
			isPathEqualOrDescendant(document.path, oldPath),
		)
		const remapping = Promise.resolve()
			.then(async () => {
				const isOwnRename = renameDestinations.get(newPath) === oldPath
				if (
					hasRenameCollision(oldPath, newPath) ||
					(!isOwnRename && hasPendingRename(oldPath, newPath))
				) {
					removePathsFromHistory([oldPath], { preserveUnsaved: true })
					return
				}
				remapPaths(oldPath, newPath)
				await Promise.all(
					moved.map(async ({ id }) => {
						const document = getDocument(id)
						if (!document) {
							return
						}
						try {
							const disk = await deps.readDocument(document.path)
							const current = getDocument(id)
							if (
								disk &&
								current?.path === document.path &&
								current.diskRevision === document.diskRevision
							) {
								applyDiskSnapshot(current, disk, true, true)
							}
						} catch (error) {
							deps.reportSaveError(error)
						}
					}),
				)
			})
			.finally(() => {
				for (const { id } of moved) {
					if (pendingRemaps.get(id) === remapping) {
						pendingRemaps.delete(id)
					}
				}
			})
		for (const { id } of moved) {
			pendingRemaps.set(id, remapping)
		}
		return remapping
	}

	const activateTabById = (id: number) => {
		const tab = getTab(id)
		const document = tab && getDocument(tab.documentId)
		const previous = getSnapshot().activeTabId
		if (!tab || !document || id === previous) {
			return
		}

		navigation += 1
		saveActiveSelection()
		const { history, historyIndex } = appendHistoryEntry(
			tab.history,
			tab.historyIndex,
			{ path: document.path, selection: null },
			MAX_HISTORY_LENGTH,
			{ allowDuplicatePath: true },
		)
		update({
			activeTabId: id,
			tabs: getSnapshot().tabs.map((current) =>
				current.id === id ? { ...tab, history, historyIndex } : current,
			),
		})
		void persistOpenTabs()
	}

	const cycleTabs = (offset: number) => {
		const { tabs, activeTabId } = getSnapshot()
		const index = tabs.findIndex((tab) => tab.id === activeTabId)
		if (index >= 0 && tabs.length > 1) {
			activateTabById(tabs[(index + offset + tabs.length) % tabs.length].id)
		}
	}

	const navigateHistory = async (delta: -1 | 1) => {
		const id = getSnapshot().activeTabId
		const tab = getTab(id)
		if (!tab) {
			return false
		}
		const target = getHistoryNavigationTarget(
			tab.history,
			tab.historyIndex,
			delta,
		)
		if (!target) {
			return false
		}
		saveActiveSelection()
		const request = ++navigation
		try {
			return await loadIntoTab(
				tab,
				target.targetEntry.path,
				request,
				(current) => ({ ...current, historyIndex: target.historyIndex }),
				(document) =>
					selections.queue(tab.id, document.path, target.targetEntry.selection),
			)
		} catch (error) {
			console.error("Failed to navigate note history:", error)
			return false
		}
	}

	const closeTabById = async (id: number) => {
		const tab = getTab(id)
		if (!tab) {
			return false
		}
		const needsSave = () =>
			lastReference(tab.documentId) && !getDocument(tab.documentId)?.isSaved
		if (
			needsSave() &&
			(!(await sessions.get(tab.documentId)?.flush()) || needsSave())
		) {
			return false
		}
		const state = getSnapshot()
		const index = state.tabs.findIndex(
			(current) => current.id === id && current.documentId === tab.documentId,
		)
		if (index < 0) {
			return false
		}
		const tabs = state.tabs.filter((current) => current.id !== id)
		if (state.activeTabId === id) {
			navigation += 1
		}
		replaceLayout(
			tabs,
			state.openDocuments,
			state.activeTabId === id
				? tabAfterRemoval(tabs, index)
				: state.activeTabId,
		)
		void persistOpenTabs()
		return true
	}

	const removePathsFromHistory = (
		paths: string[],
		options?: { preserveUnsaved?: boolean; exact?: boolean },
	) => {
		const state = getSnapshot()
		const removed = new Set<number>()
		for (const document of state.openDocuments) {
			const matches = options?.exact
				? paths.includes(document.path)
				: pathIsUnder(document.path, paths)
			if (!matches) {
				continue
			}
			if (
				options?.preserveUnsaved &&
				sessions.isPendingRename(document.id, document.path)
			) {
				continue
			}
			if (options?.preserveUnsaved && !document.isSaved) {
				sessions.conflict(document.id, { type: "deleted" })
			} else {
				removed.add(document.id)
			}
		}

		const current = getSnapshot()
		const tabs = current.tabs
			.filter((tab) => !removed.has(tab.documentId))
			.map((tab) => {
				const next = pruneHistory(tab.history, tab.historyIndex, paths, options)
				return {
					...tab,
					...(next.history.length
						? next
						: initialHistory(getDocument(tab.documentId)!.path)),
				}
			})
		const activeIndex = current.tabs.findIndex(
			(tab) => tab.id === current.activeTabId,
		)
		const activeTabId = tabs.some((tab) => tab.id === current.activeTabId)
			? current.activeTabId
			: tabAfterRemoval(tabs, activeIndex)
		if (activeTabId !== current.activeTabId) {
			navigation += 1
		}
		replaceLayout(tabs, current.openDocuments, activeTabId)
		void persistOpenTabs()
	}

	const discardDocumentChanges = async (id: number) => {
		const document = getDocument(id)
		const session = sessions.get(id)
		if (!document?.conflict || session?.isWriting()) {
			return false
		}
		if (document.conflict.type === "deleted") {
			removePathsFromHistory([document.path], { exact: true })
			return true
		}

		try {
			const revision = session?.editRevision()
			const disk = await deps.readDocument(document.path)
			if (
				getDocument(id) !== document ||
				session?.editRevision() !== revision
			) {
				return false
			}
			if (!disk) {
				removePathsFromHistory([document.path], { exact: true })
				return true
			}
			sessions.delete(id)
			updateDocument(id, (current) => ({
				...current,
				content: disk.content,
				diskRevision: disk.revision,
				sessionEpoch: current.sessionEpoch + 1,
				conflict: undefined,
				isSaved: true,
			}))
			return true
		} catch (error) {
			deps.reportSaveError(error)
			return false
		}
	}

	const getOpenDocumentSnapshots = (): OpenDocumentSnapshot[] =>
		getSnapshot().openDocuments.map(({ id, path, isSaved }) => ({
			documentId: id,
			path,
			isSaved,
		}))

	const commands = {
		openTab: async (
			path: string,
			skipHistory = false,
			force = false,
			options?: OpenTabOptions,
		) => {
			if (!supportsDocument(path)) {
				return
			}
			if (!options?.skipSelectionCapture) {
				saveActiveSelection()
			}
			const active = selectActiveTab(getSnapshot())
			const request = ++navigation
			if (active?.path === path && !force) {
				return
			}
			if (!active) {
				const workspaceGeneration = generation
				const loaded = documentAt(path) ?? (await loadDocument(path))
				if (
					loaded &&
					request === navigation &&
					workspaceGeneration === generation
				) {
					await appendTab(path, request, options, loaded)
				}
				return
			}
			await loadIntoTab(
				active,
				path,
				request,
				(tab) => {
					if (skipHistory) {
						return tab
					}
					const { history, historyIndex } = appendHistoryEntry(
						tab.history,
						tab.historyIndex,
						{ path, selection: null },
						MAX_HISTORY_LENGTH,
					)
					return { ...tab, history, historyIndex }
				},
				(document) => queueTitleSelection(active, document, options),
				force,
			)
		},
		openTabInNewTab: async (path: string, options?: OpenTabOptions) => {
			if (supportsDocument(path)) {
				if (!options?.skipSelectionCapture) {
					saveActiveSelection()
				}
				await appendTab(path, ++navigation, options)
			}
		},
		hydrateFromOpenedFiles: async (paths: string[]) => {
			const workspaceGeneration = generation
			const initial = getSnapshot()
			const valid = paths.filter(supportsDocument).slice(-MAX_HISTORY_LENGTH)
			const loaded = await Promise.all(
				[...new Set(valid)].map(async (path) => {
					try {
						return await loadDocument(path)
					} catch (error) {
						console.warn("Failed to restore note:", path, error)
						return null
					}
				}),
			)
			if (
				workspaceGeneration !== generation ||
				initial !== getSnapshot() ||
				initial.tabs.length > 0
			) {
				return false
			}
			const documents = loaded.filter(
				(document): document is OpenDocument => document !== null,
			)
			const byPath = new Map(
				documents.map((document) => [document.path, document]),
			)
			const tabs = valid.flatMap((path) => {
				const document = byPath.get(path)
				return document && !isReservedDestination(path)
					? [createTab(document)]
					: []
			})
			const active = tabs.at(-1)
			if (!active) {
				return false
			}
			replaceLayout(tabs, documents, active.id)
			return true
		},
		activateTabById,
		activateNextTab: () => cycleTabs(1),
		activatePreviousTab: () => cycleTabs(-1),
		closeTabById,
		closeActiveTab: () => {
			const { activeTabId } = getSnapshot()
			return activeTabId === null
				? Promise.resolve(false)
				: closeTabById(activeTabId)
		},
		closeAllTabs: async () => {
			if (
				!(await flushDocuments(() => true)) ||
				getSnapshot().openDocuments.some((doc) => !doc.isSaved)
			) {
				return false
			}
			generation += 1
			navigation += 1
			replaceLayout([], [], null)
			return true
		},
		goBack: () => navigateHistory(-1),
		goForward: () => navigateHistory(1),
		getDocumentById: (id: number) => selectDocumentById(getSnapshot(), id),
		getActiveTabPath: () => selectActiveTabPath(getSnapshot()),
		getOpenDocumentSnapshots,
		setTabHistorySelectionProvider: selections.register,
		consumeTabPendingHistorySelectionRestore: selections.consume,
		registerDocumentSnapshotProvider: (
			id: number,
			epoch: number,
			provider: DocumentSnapshotProvider,
		) =>
			getDocument(id)?.sessionEpoch === epoch
				? sessions
						.getOrCreate(id)
						.register(() =>
							getDocument(id)?.sessionEpoch === epoch ? provider() : null,
						)
				: () => {},
		recordDocumentEdit: (id: number, epoch: number) => {
			if (getDocument(id)?.sessionEpoch === epoch) {
				sessions.getOrCreate(id).recordEdit()
			}
		},
		requestDocumentSave: (id: number) =>
			sessions.get(id)?.requestSave() ??
			Promise.resolve(getDocument(id)?.isSaved ?? false),
		flushAllDocuments: () => flushDocuments(() => true),
		flushDocumentsUnderPaths: (paths: string[]) =>
			flushDocuments((doc) => pathIsUnder(doc.path, paths)),
		discardDocumentChanges,
		refreshTabFromExternalContent,
		reserveDocumentRename,
		renameTab,
		removePathsFromHistory,
	}

	return { getSnapshot, subscribe, commands }
}

export type DocumentWorkspace = ReturnType<typeof createDocumentWorkspace>
export type DocumentCommands = DocumentWorkspace["commands"]
