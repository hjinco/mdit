import {
	getFileNameWithoutExtension,
	isPathEqualOrDescendant,
} from "@mdit/utils/path-utils"
import { relative, resolve } from "pathe"
import type { StateCreator } from "zustand"
import type { WorkspaceSettings } from "../workspace/workspace-settings"
import type { WorkspaceSlice } from "../workspace/workspace-slice"
import { createLastOpenedFileHistoryPersistence } from "./tab-persistence"
import {
	createExternalReloadSaveSkipTracker,
	createTabHistorySession,
	updateHistorySelection,
} from "./tab-session"
import {
	buildEmptyTabState,
	buildInitialTabHistory,
	findDocumentIndexByPath,
	findTabIndexByPath,
	getActiveDocumentIdFromState,
	getActiveTabFromState,
	getActiveTabHistoryFromState,
	getActiveTabSavedFromState,
	getDocumentByIdFromState,
	getDocumentByPathFromState,
	getOpenDocumentSnapshotsFromState,
	getResolvedTabByIdFromState,
	getResolvedTabsFromState,
	getTabByIdFromState,
	resolveTabFromState,
	selectFallbackActiveTabId,
} from "./tab-state"
import type {
	OpenDocument,
	OpenDocumentSnapshot,
	OpenTabSnapshot,
	PendingHistorySelectionRestoreResult,
	ResolvedTab,
	Tab,
	TabHistorySelection,
} from "./tab-types"
import {
	appendHistoryEntry,
	getHistoryNavigationTarget,
	replaceHistoryPath,
} from "./utils/history-navigation-utils"
import { removePathsFromHistory as removePathsFromHistoryEntries } from "./utils/history-utils"

let tabIdCounter = 0
let documentIdCounter = 0

const MAX_HISTORY_LENGTH = 50

export type TabSliceDependencies = {
	readTextFile: (path: string) => Promise<string>
	renameFile: (oldPath: string, newPath: string) => Promise<void>
	saveSettings: (
		workspacePath: string,
		settings: Partial<WorkspaceSettings>,
	) => Promise<void>
}

export type {
	OpenDocument,
	OpenDocumentSnapshot,
	OpenTabSnapshot,
	PendingHistorySelectionRestoreResult,
	ResolvedTab,
	Tab,
	TabHistoryEntry,
	TabHistoryPoint,
	TabHistorySelection,
} from "./tab-types"

type RenameTabOptions = {
	refreshContent?: boolean
	renameOnFs?: boolean
}

type OpenTabOptions = {
	initialContent?: string
	initialSelection?: "title"
	skipSelectionCapture?: boolean
}

const getInitialSelectionForPath = (
	path: string,
	options?: OpenTabOptions,
): TabHistorySelection => {
	if (options?.initialSelection !== "title") {
		return null
	}

	const title = getFileNameWithoutExtension(path)
	if (!title) {
		return null
	}

	return {
		anchor: {
			path: [0, 0],
			offset: 0,
		},
		focus: {
			path: [0, 0],
			offset: title.length,
		},
	}
}

type RefreshTabFromExternalContentOptions = {
	preserveSelection?: boolean
}

export type TabSlice = {
	tabs: Tab[]
	openDocuments: OpenDocument[]
	activeTabId: number | null
	activateTab: (path: string) => void
	activateTabById: (tabId: number) => void
	activateNextTab: () => void
	activatePreviousTab: () => void
	getResolvedTabs: () => ResolvedTab[]
	getTabById: (tabId: number) => ResolvedTab | null
	getDocumentById: (documentId: number) => OpenDocument | null
	getActiveDocumentId: () => number | null
	getTabPathById: (tabId: number) => string | null
	getDocumentPathByTabId: (tabId: number) => string | null
	setHistorySelectionProvider: (
		provider: (() => TabHistorySelection) | null,
	) => void
	setTabHistorySelectionProvider: (
		tabId: number,
		provider: (() => TabHistorySelection) | null,
	) => void
	consumePendingHistorySelectionRestore: (
		path: string,
	) => PendingHistorySelectionRestoreResult
	consumeTabPendingHistorySelectionRestore: (
		tabId: number,
		path: string,
	) => PendingHistorySelectionRestoreResult
	refreshTabFromExternalContent: (
		path: string,
		content: string,
		options?: RefreshTabFromExternalContentOptions,
	) => void
	consumePendingExternalReloadSaveSkip: (documentId: number) => boolean
	hydrateFromOpenedFiles: (paths: string[]) => Promise<boolean>
	openTab: (
		path: string,
		skipHistory?: boolean,
		force?: boolean,
		options?: OpenTabOptions,
	) => Promise<void>
	openTabInNewTab: (path: string, options?: OpenTabOptions) => Promise<void>
	closeActiveTab: () => void
	closeTab: (path: string) => void
	closeTabById: (tabId: number) => void
	closeAllTabs: () => void
	renameTab: (
		oldPath: string,
		newPath: string,
		options?: RenameTabOptions,
	) => Promise<void>
	setDocumentSaved: (documentId: number, isSaved: boolean) => void
	setTabSaved: (tabId: number, isSaved: boolean) => void
	goBack: () => Promise<boolean>
	goForward: () => Promise<boolean>
	canGoBack: () => boolean
	canGoForward: () => boolean
	getActiveTab: () => ResolvedTab | null
	getOpenDocumentSnapshots: () => OpenDocumentSnapshot[]
	getOpenTabSnapshots: () => OpenTabSnapshot[]
	getActiveTabPath: () => string | null
	getIsSaved: () => boolean
	updateHistoryPath: (oldPath: string, newPath: string) => void
	removePathsFromHistory: (paths: string[]) => void
	clearHistory: () => void
}

export const prepareTabSlice =
	({
		readTextFile,
		renameFile,
		saveSettings,
	}: TabSliceDependencies): StateCreator<
		TabSlice & WorkspaceSlice,
		[],
		[],
		TabSlice
	> =>
	(set, get) => {
		const historySession = createTabHistorySession()
		const externalReloadSaveSkipTracker = createExternalReloadSaveSkipTracker()
		const lastOpenedFileHistoryPersistence =
			createLastOpenedFileHistoryPersistence({
				getState: () => {
					const state = get()
					return {
						workspacePath: state.workspacePath,
						tabs: state.tabs,
						openDocuments: state.openDocuments,
						activeTabId: state.activeTabId,
					}
				},
				saveSettings,
				onError: (error) => {
					console.error("Failed to persist last opened file history:", error)
				},
			})

		const findTabIndexById = (tabs: Tab[], tabId: number): number =>
			tabs.findIndex((tab) => tab.id === tabId)

		const buildDocument = ({
			path,
			name,
			content,
		}: Pick<OpenDocument, "path" | "name" | "content">): OpenDocument => ({
			id: ++documentIdCounter,
			path,
			name,
			content,
			sessionEpoch: 0,
			isSaved: true,
		})

		const buildTab = (documentId: number, path: string): Tab => ({
			id: ++tabIdCounter,
			documentId,
			...buildInitialTabHistory(path),
		})

		const updateTabById = (
			state: Pick<TabSlice, "tabs">,
			tabId: number,
			updater: (tab: Tab) => Tab | null,
		): Pick<TabSlice, "tabs"> | {} => {
			const tabIndex = findTabIndexById(state.tabs, tabId)
			if (tabIndex === -1) {
				return {}
			}

			const currentTab = state.tabs[tabIndex]
			const nextTab = updater(currentTab)
			if (!nextTab) {
				return {}
			}

			const nextTabs = [...state.tabs]
			nextTabs[tabIndex] = nextTab
			return {
				tabs: nextTabs,
			}
		}

		const updateDocumentById = (
			state: Pick<TabSlice, "openDocuments">,
			documentId: number,
			updater: (document: OpenDocument) => OpenDocument | null,
		): Pick<TabSlice, "openDocuments"> | {} => {
			const documentIndex = state.openDocuments.findIndex(
				(document) => document.id === documentId,
			)
			if (documentIndex === -1) {
				return {}
			}

			const currentDocument = state.openDocuments[documentIndex]
			const nextDocument = updater(currentDocument)
			if (!nextDocument) {
				return {}
			}

			const nextOpenDocuments = [...state.openDocuments]
			nextOpenDocuments[documentIndex] = nextDocument
			return {
				openDocuments: nextOpenDocuments,
			}
		}

		const pruneOrphanedDocuments = (
			tabs: readonly Tab[],
			openDocuments: readonly OpenDocument[],
		): {
			nextOpenDocuments: OpenDocument[]
			removedDocumentIds: number[]
		} => {
			const referencedDocumentIds = new Set(tabs.map((tab) => tab.documentId))
			const removedDocumentIds: number[] = []
			const nextOpenDocuments = openDocuments.filter((document) => {
				if (referencedDocumentIds.has(document.id)) {
					return true
				}

				removedDocumentIds.push(document.id)
				return false
			})

			return {
				nextOpenDocuments,
				removedDocumentIds,
			}
		}

		const loadDocumentDraft = async (
			path: string,
			options?: OpenTabOptions,
		): Promise<Pick<OpenDocument, "path" | "name" | "content"> | null> => {
			const content =
				options?.initialContent !== undefined
					? options.initialContent
					: await readTextFile(path)
			const name = getFileNameWithoutExtension(path)

			if (!name) {
				return null
			}

			return {
				path,
				name,
				content,
			}
		}

		const updateCurrentHistorySelection = (selection: TabHistorySelection) => {
			set((state) => {
				const activeTab = getTabByIdFromState(state, state.activeTabId ?? -1)
				if (!activeTab) {
					return {}
				}

				const nextHistory = updateHistorySelection(activeTab, selection)
				if (!nextHistory) {
					return {}
				}

				return updateTabById(state, activeTab.id, (tab) => ({
					...tab,
					history: nextHistory,
				}))
			})
		}

		const commitCurrentHistorySelection = () => {
			const activeTabId = get().activeTabId
			if (activeTabId === null) {
				return
			}

			updateCurrentHistorySelection(
				historySession.readCurrentSelection(activeTabId),
			)
		}

		const appendVisitToTabHistory = (tabId: number, path: string) => {
			set((state) =>
				updateTabById(state, tabId, (tab) => {
					const nextHistoryState = appendHistoryEntry(
						tab.history,
						tab.historyIndex,
						{
							path,
							selection: null,
						},
						MAX_HISTORY_LENGTH,
						{
							allowDuplicatePath: true,
						},
					)

					if (!nextHistoryState.didChange) {
						return null
					}

					return {
						...tab,
						history: nextHistoryState.history,
						historyIndex: nextHistoryState.historyIndex,
					}
				}),
			)
		}

		const activateTabByIndex = (tabIndex: number): ResolvedTab | null => {
			let activatedTab: ResolvedTab | null = null

			set((state) => {
				const targetTab = state.tabs[tabIndex]
				if (!targetTab || state.activeTabId === targetTab.id) {
					return {}
				}

				activatedTab = resolveTabFromState(state, targetTab)
				return {
					activeTabId: targetTab.id,
				}
			})

			return activatedTab
		}

		const activateTabAndTrack = (tabIndex: number) => {
			const activatedTab = activateTabByIndex(tabIndex)
			if (!activatedTab) {
				return
			}

			appendVisitToTabHistory(activatedTab.id, activatedTab.path)
			lastOpenedFileHistoryPersistence.enqueueSafely()
		}

		const clearRuntimeState = () => {
			externalReloadSaveSkipTracker.clear()
			for (const tab of get().tabs) {
				historySession.clear(tab.id)
			}
		}

		const persistLastOpenedTabs = async () => {
			await lastOpenedFileHistoryPersistence.enqueue()
		}

		const setAndPersistLastOpenedFileHistory = (
			updater: (state: TabSlice) => Partial<TabSlice> | {},
		): boolean => {
			let didChange = false

			set((state) => {
				const nextState = updater(state)
				didChange = Object.keys(nextState).length > 0
				return nextState
			})

			if (didChange) {
				lastOpenedFileHistoryPersistence.enqueueSafely()
			}

			return didChange
		}

		const appendTabForPath = async (
			path: string,
			options?: OpenTabOptions,
		): Promise<void> => {
			const existingDocument = getDocumentByPathFromState(get(), path)
			const documentDraft = existingDocument
				? null
				: await loadDocumentDraft(path, options)
			if (!existingDocument && !documentDraft) {
				return
			}

			let nextTabId: number | null = null

			set((state) => {
				let targetDocument = getDocumentByPathFromState(state, path)
				let nextOpenDocuments = state.openDocuments

				if (!targetDocument) {
					if (!documentDraft) {
						return {}
					}

					targetDocument = buildDocument(documentDraft)
					nextOpenDocuments = [...state.openDocuments, targetDocument]
				}

				const nextTab = buildTab(targetDocument.id, targetDocument.path)
				nextTabId = nextTab.id
				return {
					tabs: [...state.tabs, nextTab],
					openDocuments: nextOpenDocuments,
					activeTabId: nextTab.id,
				}
			})

			const initialSelection = getInitialSelectionForPath(path, options)
			if (nextTabId !== null && initialSelection) {
				historySession.queuePendingRestore(nextTabId, path, initialSelection)
			}

			await persistLastOpenedTabs()
		}

		const rebindActiveTabToPath = async (
			activeTabId: number,
			path: string,
			skipHistory: boolean,
			force: boolean,
			options?: OpenTabOptions,
		): Promise<void> => {
			const shouldLoadDocument =
				force || findDocumentIndexByPath(get(), path) === -1
			const documentDraft = shouldLoadDocument
				? await loadDocumentDraft(path, options)
				: null
			if (shouldLoadDocument && !documentDraft) {
				return
			}

			let removedDocumentIds: number[] = []
			let documentIdToSkipSave: number | null = null

			set((state) => {
				const currentIndex = findTabIndexById(state.tabs, activeTabId)
				if (currentIndex === -1) {
					return {}
				}

				const currentTab = state.tabs[currentIndex]
				let targetDocument = getDocumentByPathFromState(state, path)
				let nextOpenDocuments = state.openDocuments

				if (!targetDocument) {
					if (!documentDraft) {
						return {}
					}

					targetDocument = buildDocument(documentDraft)
					nextOpenDocuments = [...state.openDocuments, targetDocument]
				} else if (documentDraft) {
					const targetDocumentId = targetDocument.id
					documentIdToSkipSave =
						getActiveDocumentIdFromState(state) === targetDocumentId
							? targetDocumentId
							: null
					nextOpenDocuments = state.openDocuments.map((document) =>
						document.id !== targetDocumentId
							? document
							: {
									...document,
									path: documentDraft.path,
									name: documentDraft.name,
									content: documentDraft.content,
									sessionEpoch: document.sessionEpoch + 1,
									isSaved: true,
								},
					)
					targetDocument = nextOpenDocuments.find(
						(document) => document.id === targetDocumentId,
					)!
				}

				const nextHistoryState = skipHistory
					? {
							history: currentTab.history,
							historyIndex: currentTab.historyIndex,
						}
					: appendHistoryEntry(
							currentTab.history,
							currentTab.historyIndex,
							{
								path,
								selection: null,
							},
							MAX_HISTORY_LENGTH,
						)

				const nextTabs = [...state.tabs]
				nextTabs[currentIndex] = {
					...currentTab,
					documentId: targetDocument.id,
					history: nextHistoryState.history,
					historyIndex: nextHistoryState.historyIndex,
				}

				const prunedDocuments = pruneOrphanedDocuments(
					nextTabs,
					nextOpenDocuments,
				)
				removedDocumentIds = prunedDocuments.removedDocumentIds

				return {
					tabs: nextTabs,
					openDocuments: prunedDocuments.nextOpenDocuments,
					activeTabId: activeTabId,
				}
			})

			const initialSelection = getInitialSelectionForPath(path, options)
			if (initialSelection) {
				historySession.queuePendingRestore(activeTabId, path, initialSelection)
			}

			if (documentIdToSkipSave !== null) {
				externalReloadSaveSkipTracker.add(documentIdToSkipSave)
			}

			for (const removedDocumentId of removedDocumentIds) {
				externalReloadSaveSkipTracker.remove(removedDocumentId)
			}

			await persistLastOpenedTabs()
		}

		const closeTabByIdInternal = (tabId: number): boolean => {
			let removedDocumentIds: number[] = []

			const didChange = setAndPersistLastOpenedFileHistory((state) => {
				const tabIndex = findTabIndexById(state.tabs, tabId)
				if (tabIndex === -1) {
					return {}
				}

				const nextTabs = state.tabs.filter((_, index) => index !== tabIndex)
				const nextActiveTabId =
					state.activeTabId === tabId
						? selectFallbackActiveTabId(nextTabs, tabIndex)
						: state.activeTabId
				const prunedDocuments = pruneOrphanedDocuments(
					nextTabs,
					state.openDocuments,
				)
				removedDocumentIds = prunedDocuments.removedDocumentIds

				historySession.clear(tabId)

				return {
					tabs: nextTabs,
					openDocuments: prunedDocuments.nextOpenDocuments,
					activeTabId: nextActiveTabId,
				}
			})

			if (didChange) {
				for (const removedDocumentId of removedDocumentIds) {
					externalReloadSaveSkipTracker.remove(removedDocumentId)
				}
			}

			return didChange
		}

		const resetActiveDocumentSession = () => {
			set((state) => {
				const activeDocumentId = getActiveDocumentIdFromState(state)
				if (activeDocumentId === null) {
					return {}
				}

				return updateDocumentById(state, activeDocumentId, (document) => ({
					...document,
					sessionEpoch: document.sessionEpoch + 1,
				}))
			})
		}

		const navigateHistory = async (
			delta: -1 | 1,
			direction: "back" | "forward",
		): Promise<boolean> => {
			const state = get()
			const activeTab = getActiveTabFromState(state)
			if (!activeTab) {
				return false
			}

			const navigationTarget = getHistoryNavigationTarget(
				activeTab.history,
				activeTab.historyIndex,
				delta,
			)
			if (!navigationTarget) {
				return false
			}

			commitCurrentHistorySelection()
			historySession.queuePendingRestore(
				activeTab.id,
				navigationTarget.targetEntry.path,
				navigationTarget.targetEntry.selection,
			)

			set((currentState) =>
				updateTabById(currentState, activeTab.id, (tab) => ({
					...tab,
					historyIndex: navigationTarget.historyIndex,
				})),
			)

			try {
				if (navigationTarget.targetEntry.path === activeTab.path) {
					resetActiveDocumentSession()
					return true
				}

				await get().openTab(navigationTarget.targetEntry.path, true, false, {
					skipSelectionCapture: true,
				})
				return true
			} catch (error) {
				historySession.clearPendingRestore(activeTab.id)
				console.error(`Failed to go ${direction} in history:`, error)
				return false
			}
		}

		return {
			...buildEmptyTabState(),
			activateTab: (path) => {
				commitCurrentHistorySelection()

				const tabIndex = findTabIndexByPath(get(), path)
				if (tabIndex === -1) {
					return
				}

				activateTabAndTrack(tabIndex)
			},
			activateTabById: (tabId) => {
				commitCurrentHistorySelection()

				const tabIndex = findTabIndexById(get().tabs, tabId)
				if (tabIndex === -1) {
					return
				}

				activateTabAndTrack(tabIndex)
			},
			activateNextTab: () => {
				commitCurrentHistorySelection()

				const state = get()
				if (state.tabs.length <= 1) {
					return
				}

				const activeTabIndex = state.tabs.findIndex(
					(tab) => tab.id === state.activeTabId,
				)
				if (activeTabIndex === -1) {
					return
				}

				activateTabAndTrack((activeTabIndex + 1) % state.tabs.length)
			},
			activatePreviousTab: () => {
				commitCurrentHistorySelection()

				const state = get()
				if (state.tabs.length <= 1) {
					return
				}

				const activeTabIndex = state.tabs.findIndex(
					(tab) => tab.id === state.activeTabId,
				)
				if (activeTabIndex === -1) {
					return
				}

				activateTabAndTrack(
					(activeTabIndex - 1 + state.tabs.length) % state.tabs.length,
				)
			},
			getResolvedTabs: () => getResolvedTabsFromState(get()),
			getTabById: (tabId) => getResolvedTabByIdFromState(get(), tabId),
			getDocumentById: (documentId) =>
				getDocumentByIdFromState(get(), documentId),
			getActiveDocumentId: () => getActiveDocumentIdFromState(get()),
			getTabPathById: (tabId) =>
				getResolvedTabByIdFromState(get(), tabId)?.path ?? null,
			getDocumentPathByTabId: (tabId) =>
				getResolvedTabByIdFromState(get(), tabId)?.path ?? null,
			setHistorySelectionProvider: (provider) => {
				const activeTabId = get().activeTabId
				if (activeTabId === null) {
					return
				}

				historySession.setSelectionProvider(activeTabId, provider)
			},
			setTabHistorySelectionProvider: (tabId, provider) => {
				historySession.setSelectionProvider(tabId, provider)
			},
			consumePendingHistorySelectionRestore: (path) =>
				(() => {
					const activeTabId = get().activeTabId
					if (activeTabId === null) {
						return { found: false } as const
					}

					return historySession.consumePendingRestore(activeTabId, path)
				})(),
			consumeTabPendingHistorySelectionRestore: (tabId, path) =>
				historySession.consumePendingRestore(tabId, path),
			refreshTabFromExternalContent: (path, content, options) => {
				const state = get()
				const matchingDocument = getDocumentByPathFromState(state, path)
				if (!matchingDocument) {
					return
				}

				if (matchingDocument.content === content || !matchingDocument.isSaved) {
					return
				}

				const activeTabId = state.activeTabId
				const isActiveDocument =
					activeTabId !== null &&
					getActiveDocumentIdFromState(state) === matchingDocument.id
				const nextSelection =
					isActiveDocument && options?.preserveSelection && activeTabId !== null
						? historySession.readCurrentSelection(activeTabId)
						: null
				let didRefresh = false

				set((currentState) => {
					const currentDocument = getDocumentByPathFromState(currentState, path)
					if (!currentDocument) {
						return {}
					}

					if (currentDocument.content === content || !currentDocument.isSaved) {
						return {}
					}

					didRefresh = true
					if (
						getActiveDocumentIdFromState(currentState) === currentDocument.id
					) {
						externalReloadSaveSkipTracker.add(currentDocument.id)
					}

					return updateDocumentById(
						currentState,
						currentDocument.id,
						(document) => ({
							...document,
							content,
							sessionEpoch: document.sessionEpoch + 1,
							isSaved: true,
						}),
					)
				})

				if (
					!didRefresh ||
					!isActiveDocument ||
					!options?.preserveSelection ||
					activeTabId === null
				) {
					return
				}

				updateCurrentHistorySelection(nextSelection)
				historySession.queuePendingRestore(activeTabId, path, nextSelection)
			},
			consumePendingExternalReloadSaveSkip: (documentId) =>
				externalReloadSaveSkipTracker.consume(documentId),
			hydrateFromOpenedFiles: async (paths: string[]) => {
				const validPaths = paths
					.filter((path) => path.endsWith(".md"))
					.slice(0, MAX_HISTORY_LENGTH)

				if (validPaths.length === 0) {
					return false
				}

				const uniquePaths = Array.from(new Set(validPaths))

				try {
					const documentDrafts = new Map<
						string,
						Pick<OpenDocument, "path" | "name" | "content">
					>()

					for (const currentPath of uniquePaths) {
						const draft = await loadDocumentDraft(currentPath)
						if (!draft) {
							continue
						}

						documentDrafts.set(currentPath, draft)
					}

					const openDocuments = uniquePaths
						.map((path) => documentDrafts.get(path))
						.filter(
							(
								document,
							): document is Pick<OpenDocument, "path" | "name" | "content"> =>
								document !== undefined,
						)
						.map((document) => buildDocument(document))
					if (openDocuments.length === 0) {
						return false
					}

					const documentIdByPath = new Map(
						openDocuments.map((document) => [document.path, document.id]),
					)
					const tabs = validPaths
						.map((path) => {
							const documentId = documentIdByPath.get(path)
							if (documentId === undefined) {
								return null
							}

							return buildTab(documentId, path)
						})
						.filter((tab): tab is Tab => tab !== null)
					const activeTab = tabs[tabs.length - 1]
					if (!activeTab) {
						return false
					}

					clearRuntimeState()
					set({
						tabs,
						openDocuments,
						activeTabId: activeTab.id,
					})

					return true
				} catch (error) {
					console.error("Failed to hydrate tabs from opened files:", error)
					return false
				}
			},
			openTab: async (
				path: string,
				skipHistory = false,
				force = false,
				options?: OpenTabOptions,
			) => {
				if (!path.endsWith(".md")) {
					return
				}

				if (!options?.skipSelectionCapture) {
					commitCurrentHistorySelection()
				}

				const state = get()
				const activeTab = getActiveTabFromState(state)

				if (!force && activeTab?.path === path) {
					return
				}

				if (!activeTab) {
					await appendTabForPath(path, options)
					return
				}

				await rebindActiveTabToPath(
					activeTab.id,
					path,
					skipHistory,
					force,
					options,
				)
			},
			openTabInNewTab: async (path, options) => {
				if (!path.endsWith(".md")) {
					return
				}

				if (!options?.skipSelectionCapture) {
					commitCurrentHistorySelection()
				}

				await appendTabForPath(path, options)
			},
			closeActiveTab: () => {
				const activeTabId = get().activeTabId
				if (activeTabId === null) {
					return
				}

				closeTabByIdInternal(activeTabId)
			},
			closeTab: (path) => {
				const tab = getResolvedTabsFromState(get()).find(
					(currentTab) => currentTab.path === path,
				)
				if (!tab) {
					return
				}

				closeTabByIdInternal(tab.id)
			},
			closeTabById: (tabId) => {
				closeTabByIdInternal(tabId)
			},
			closeAllTabs: () => {
				clearRuntimeState()
				set(buildEmptyTabState())
			},
			renameTab: async (oldPath, newPath, options) => {
				const refreshContent = options?.refreshContent ?? false
				const shouldRenameOnFs = options?.renameOnFs ?? false
				const matchingDocuments = get().openDocuments.filter((document) =>
					isPathEqualOrDescendant(document.path, oldPath),
				)

				if (matchingDocuments.length === 0) {
					return
				}

				if (shouldRenameOnFs && oldPath !== newPath) {
					try {
						await renameFile(oldPath, newPath)
					} catch (error) {
						console.error("Failed to rename tab on filesystem:", error)
						throw error
					}
				}

				let refreshedContent: string | null = null
				if (refreshContent && newPath.endsWith(".md")) {
					try {
						refreshedContent = await readTextFile(newPath)
					} catch (error) {
						console.error("Failed to refresh tab content after rename:", error)
					}
				}

				set((state) => {
					let didChange = false
					const activeDocumentId = getActiveDocumentIdFromState(state)
					const nextOpenDocuments = state.openDocuments.map((document) => {
						if (!isPathEqualOrDescendant(document.path, oldPath)) {
							return document
						}

						const nextPath =
							document.path === oldPath
								? newPath
								: resolve(newPath, relative(oldPath, document.path))
						const nextName = getFileNameWithoutExtension(nextPath)
						if (!nextName) {
							return document
						}

						let nextDocument = {
							...document,
							path: nextPath,
							name: nextName,
						}

						if (refreshContent && document.path === oldPath) {
							if (refreshedContent !== null) {
								nextDocument = {
									...nextDocument,
									content: refreshedContent,
									sessionEpoch: document.sessionEpoch + 1,
								}
								if (activeDocumentId === document.id) {
									externalReloadSaveSkipTracker.add(document.id)
								}
							}
						}

						didChange = true
						return nextDocument
					})

					if (!didChange) {
						return {}
					}

					const nextTabs = state.tabs.map((tab) => {
						const resolvedTab = resolveTabFromState(state, tab)
						if (
							!resolvedTab ||
							!isPathEqualOrDescendant(resolvedTab.path, oldPath)
						) {
							return tab
						}

						return {
							...tab,
							history: replaceHistoryPath(tab.history, oldPath, newPath),
						}
					})

					return {
						tabs: nextTabs,
						openDocuments: nextOpenDocuments,
						activeTabId: state.activeTabId,
					}
				})
			},
			setDocumentSaved: (documentId, isSaved) => {
				set((state) =>
					updateDocumentById(state, documentId, (document) =>
						document.isSaved === isSaved
							? null
							: {
									...document,
									isSaved,
								},
					),
				)
			},
			setTabSaved: (tabId, isSaved) => {
				const tab = getTabByIdFromState(get(), tabId)
				if (!tab) {
					return
				}

				get().setDocumentSaved(tab.documentId, isSaved)
			},
			goBack: async () => navigateHistory(-1, "back"),
			goForward: async () => navigateHistory(1, "forward"),
			canGoBack: () => getActiveTabHistoryFromState(get()).historyIndex > 0,
			canGoForward: () => {
				const { history, historyIndex } = getActiveTabHistoryFromState(get())
				return historyIndex < history.length - 1
			},
			getActiveTab: () => getActiveTabFromState(get()),
			getOpenDocumentSnapshots: () => getOpenDocumentSnapshotsFromState(get()),
			getOpenTabSnapshots: () =>
				getOpenDocumentSnapshotsFromState(get()).map((document) => ({
					path: document.path,
					isSaved: document.isSaved,
				})),
			getActiveTabPath: () => getActiveTabFromState(get())?.path ?? null,
			getIsSaved: () => getActiveTabSavedFromState(get()),
			updateHistoryPath: (oldPath: string, newPath: string) => {
				setAndPersistLastOpenedFileHistory((state) => ({
					tabs: state.tabs.map((tab) => ({
						...tab,
						history: replaceHistoryPath(tab.history, oldPath, newPath),
					})),
				}))
			},
			removePathsFromHistory: (paths) => {
				const state = get()
				const removedDocumentIds = new Set(
					state.openDocuments
						.filter((document) =>
							paths.some((path) =>
								isPathEqualOrDescendant(document.path, path),
							),
						)
						.map((document) => document.id),
				)
				for (const documentId of removedDocumentIds) {
					externalReloadSaveSkipTracker.remove(documentId)
				}
				for (const tab of state.tabs) {
					if (removedDocumentIds.has(tab.documentId)) {
						historySession.clear(tab.id)
					}
				}

				setAndPersistLastOpenedFileHistory((currentState) => {
					let didChange = removedDocumentIds.size > 0
					const nextTabs = currentState.tabs
						.filter((tab) => !removedDocumentIds.has(tab.documentId))
						.map((tab) => {
							const nextHistoryState = removePathsFromHistoryEntries(
								tab.history,
								tab.historyIndex,
								paths,
							)
							if (nextHistoryState.history.length === 0) {
								const path =
									getDocumentByIdFromState(currentState, tab.documentId)
										?.path ??
									tab.history[tab.historyIndex]?.path ??
									tab.history[0]?.path
								if (!path) {
									return tab
								}

								didChange = true
								return {
									...tab,
									...buildInitialTabHistory(path),
								}
							}

							if (
								nextHistoryState.history !== tab.history ||
								nextHistoryState.historyIndex !== tab.historyIndex
							) {
								didChange = true
							}
							return {
								...tab,
								history: nextHistoryState.history,
								historyIndex: nextHistoryState.historyIndex,
							}
						})

					let nextActiveTabId = currentState.activeTabId
					if (
						currentState.activeTabId !== null &&
						!nextTabs.some((tab) => tab.id === currentState.activeTabId)
					) {
						const removedIndex = currentState.tabs.findIndex(
							(tab) => tab.id === currentState.activeTabId,
						)
						nextActiveTabId = selectFallbackActiveTabId(nextTabs, removedIndex)
					}

					if (!didChange) {
						return {}
					}

					return {
						tabs: nextTabs,
						openDocuments: currentState.openDocuments.filter(
							(document) => !removedDocumentIds.has(document.id),
						),
						activeTabId: nextActiveTabId,
					}
				})
			},
			clearHistory: () => {
				for (const tab of get().tabs) {
					historySession.clearPendingRestore(tab.id)
				}
				set((state) => ({
					tabs: state.tabs.map((tab) => {
						const path = getDocumentByIdFromState(state, tab.documentId)?.path
						if (!path) {
							return tab
						}

						return {
							...tab,
							...buildInitialTabHistory(path),
						}
					}),
				}))
			},
		}
	}
