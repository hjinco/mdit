import type { LocalMutationTarget } from "@mdit/local-fs-origin"
import { areStringArraysEqual } from "@mdit/utils/array-utils"
import {
	getFileNameFromPath,
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@mdit/utils/path-utils"
import { join, relative } from "pathe"
import type { createState } from "../create-state"
import {
	addEntryToState,
	findEntryByPath,
	moveEntryInState,
	removeEntriesFromState,
	sortWorkspaceEntries,
	updateEntryInState,
	updateEntryMetadata,
} from "./entry-tree"
import { readWorkspaceEntriesFromPath } from "./filesystem"
import {
	readDirectorySettings,
	storeDirectorySettings,
	type WorkspaceSettingsRepository,
} from "./settings"
import type {
	FileSystemRepositoryLike,
	WorkspaceEntry,
	WorkspaceSettings,
	WorkspaceState,
} from "./types"
import type { WorkspaceWatchDependencies } from "./watch-types"

type EntryCreated = {
	parentPath: string
	entry: WorkspaceEntry
	expandParent?: boolean
	expandNewDirectory?: boolean
}

const remapPath = (path: string, oldPath: string, newPath: string): string =>
	isPathEqualOrDescendant(path, oldPath)
		? join(newPath, relative(oldPath, path))
		: path

const remapOptionalPath = (
	path: string | null,
	oldPath: string,
	newPath: string,
) => (path === null ? null : remapPath(path, oldPath, newPath))

const collectDirectories = (entries: WorkspaceEntry[], paths: Set<string>) => {
	for (const entry of entries) {
		if (entry.isDirectory) {
			paths.add(normalizePathSeparators(entry.path))
			collectDirectories(entry.children ?? [], paths)
		}
	}
}

const replaceSubtrees = (
	entries: WorkspaceEntry[],
	subtrees: ReadonlyMap<string, WorkspaceEntry[]>,
): WorkspaceEntry[] => {
	let changed = false
	const next = entries.map((entry) => {
		if (!entry.isDirectory) {
			return entry
		}
		const previous = entry.children
		const children =
			subtrees.get(normalizePathSeparators(entry.path)) ??
			(previous && replaceSubtrees(previous, subtrees))
		if (children === previous) {
			return entry
		}
		changed = true
		return { ...entry, children }
	})
	return changed ? next : entries
}

export function createWorkspaceTreeProjection({
	state,
	fileSystem,
	settings,
	documents,
	isCurrentSession,
	registerLocalMutation,
}: {
	state: ReturnType<typeof createState<WorkspaceState>>
	fileSystem: FileSystemRepositoryLike
	settings: WorkspaceSettingsRepository
	documents: Pick<
		WorkspaceWatchDependencies["documents"],
		"removePathsFromHistory"
	> & {
		renameTab(oldPath: string, newPath: string): Promise<void>
	}
	isCurrentSession: (sessionId: number) => boolean
	registerLocalMutation: (targets: LocalMutationTarget[]) => void
}) {
	const { getSnapshot } = state
	let refreshVersion = 0

	const persistDirectoryUi = async (
		workspacePath: string,
		previous: Pick<WorkspaceState, "expandedDirectories" | "pinnedDirectories">,
		next: Pick<WorkspaceState, "expandedDirectories" | "pinnedDirectories">,
	) => {
		const patch: Partial<WorkspaceSettings> = {}
		if (
			!areStringArraysEqual(
				previous.expandedDirectories,
				next.expandedDirectories,
			)
		) {
			patch.expandedDirectories = storeDirectorySettings(
				workspacePath,
				next.expandedDirectories,
			)
		}
		if (
			!areStringArraysEqual(previous.pinnedDirectories, next.pinnedDirectories)
		) {
			patch.pinnedDirectories = storeDirectorySettings(
				workspacePath,
				next.pinnedDirectories,
			)
		}
		if (Object.keys(patch).length > 0) {
			try {
				await settings.saveSettings(workspacePath, patch)
			} catch (error) {
				console.error("Failed to persist workspace directories:", error)
			}
		}
	}

	const syncEntries = async (
		entries: WorkspaceEntry[],
		loadedSettings?: WorkspaceSettings,
	) => {
		const previous = getSnapshot()
		const { workspacePath } = previous
		if (!workspacePath) {
			return
		}
		const storedDirectories = loadedSettings
			? {
					expandedDirectories: readDirectorySettings(
						workspacePath,
						loadedSettings.expandedDirectories,
					),
					pinnedDirectories: readDirectorySettings(
						workspacePath,
						loadedSettings.pinnedDirectories,
					),
				}
			: previous
		const validDirectories = new Set<string>()
		collectDirectories(entries, validDirectories)
		const next = {
			entries,
			expandedDirectories: storedDirectories.expandedDirectories.filter(
				(path) => validDirectories.has(path),
			),
			pinnedDirectories: storedDirectories.pinnedDirectories.filter(
				(path) =>
					path === normalizePathSeparators(workspacePath) ||
					validDirectories.has(path),
			),
		}
		state.update(next)
		await persistDirectoryUi(workspacePath, storedDirectories, next)
	}

	const readEntries = (path: string) =>
		readWorkspaceEntriesFromPath(path, fileSystem)
	const getEntryByPath = (path: string) =>
		findEntryByPath(getSnapshot().entries, path)

	const refreshWorkspaceEntries = async (isCurrent = () => true) => {
		const { sessionId, workspacePath } = getSnapshot()
		if (!workspacePath) {
			return
		}
		const refresh = ++refreshVersion
		state.update({ isTreeLoading: true })
		try {
			const entries = await readEntries(workspacePath)
			if (
				isCurrent() &&
				isCurrentSession(sessionId) &&
				refresh === refreshVersion
			) {
				await syncEntries(entries)
			}
		} finally {
			if (isCurrentSession(sessionId) && refresh === refreshVersion) {
				state.update({ isTreeLoading: false })
			}
		}
	}

	const reconcileDirectoryEntries = async (
		paths: string[],
		isCurrent = () => true,
	) => {
		const { sessionId, workspacePath } = getSnapshot()
		if (!workspacePath || paths.length === 0) {
			return
		}
		const subtrees = new Map(
			await Promise.all(
				paths.map(
					async (path) =>
						[normalizePathSeparators(path), await readEntries(path)] as const,
				),
			),
		)
		if (isCurrent() && isCurrentSession(sessionId)) {
			await syncEntries(
				subtrees.get(normalizePathSeparators(workspacePath)) ??
					replaceSubtrees(getSnapshot().entries, subtrees),
			)
		}
	}

	const entryCreated = async ({
		parentPath,
		entry,
		expandParent,
		expandNewDirectory,
	}: EntryCreated) => {
		const previous = getSnapshot()
		const { workspacePath, entries, expandedDirectories, pinnedDirectories } =
			previous
		if (!workspacePath) {
			return
		}
		const withoutDuplicate = removeEntriesFromState(entries, [entry.path])
		const next = {
			entries:
				parentPath === workspacePath
					? sortWorkspaceEntries([...withoutDuplicate, entry])
					: addEntryToState(withoutDuplicate, parentPath, entry),
			expandedDirectories:
				expandParent || expandNewDirectory
					? [
							...new Set([
								...expandedDirectories,
								...(expandParent && parentPath !== workspacePath
									? [parentPath]
									: []),
								...(expandNewDirectory ? [entry.path] : []),
							]),
						]
					: expandedDirectories,
			pinnedDirectories,
		}
		state.update(next)
		await persistDirectoryUi(workspacePath, previous, next)
	}

	const entriesDeleted = async ({
		paths,
		preserveUnsaved,
	}: {
		paths: string[]
		preserveUnsaved: boolean
	}) => {
		const previous = getSnapshot()
		const { workspacePath } = previous
		if (!workspacePath) {
			return
		}
		const keep = (path: string) =>
			!paths.some((deleted) => isPathEqualOrDescendant(path, deleted))
		const next = {
			entries: removeEntriesFromState(previous.entries, paths),
			expandedDirectories: previous.expandedDirectories.filter(keep),
			pinnedDirectories: previous.pinnedDirectories.filter(keep),
			selectedEntryPaths: new Set(
				[...previous.selectedEntryPaths].filter(keep),
			),
			selectionAnchorPath:
				previous.selectionAnchorPath && keep(previous.selectionAnchorPath)
					? previous.selectionAnchorPath
					: null,
			currentCollectionPath:
				previous.currentCollectionPath && keep(previous.currentCollectionPath)
					? previous.currentCollectionPath
					: null,
			lastCollectionPath:
				previous.lastCollectionPath && keep(previous.lastCollectionPath)
					? previous.lastCollectionPath
					: null,
		}
		state.update(next)
		documents.removePathsFromHistory(paths, { preserveUnsaved })
		await persistDirectoryUi(workspacePath, previous, next)
	}

	const applyPathChange = (
		oldPath: string,
		newPath: string,
		entries: WorkspaceEntry[],
	) => {
		const previous = getSnapshot()
		const { workspacePath } = previous
		if (!workspacePath) {
			return Promise.resolve()
		}
		const remap = (path: string) => remapPath(path, oldPath, newPath)
		const next = {
			entries,
			expandedDirectories: [
				...new Set(previous.expandedDirectories.map(remap)),
			],
			pinnedDirectories: [...new Set(previous.pinnedDirectories.map(remap))],
			selectedEntryPaths: new Set([...previous.selectedEntryPaths].map(remap)),
			selectionAnchorPath: remapOptionalPath(
				previous.selectionAnchorPath,
				oldPath,
				newPath,
			),
			currentCollectionPath: remapOptionalPath(
				previous.currentCollectionPath,
				oldPath,
				newPath,
			),
			lastCollectionPath: remapOptionalPath(
				previous.lastCollectionPath,
				oldPath,
				newPath,
			),
		}
		state.update(next)
		return persistDirectoryUi(workspacePath, previous, next)
	}

	const entryRenamed: WorkspaceWatchDependencies["tree"]["entryRenamed"] =
		async ({ oldPath, newPath, newName }) => {
			const persistence = applyPathChange(
				oldPath,
				newPath,
				updateEntryInState(getSnapshot().entries, oldPath, newPath, newName),
			)
			await Promise.all([persistence, documents.renameTab(oldPath, newPath)])
		}

	const entryMoved: WorkspaceWatchDependencies["tree"]["entryMoved"] = async ({
		sourcePath,
		destinationDirPath,
		newPath,
	}) => {
		const { entries, workspacePath } = getSnapshot()
		if (!workspacePath) {
			return
		}
		const persistence = applyPathChange(
			sourcePath,
			newPath,
			moveEntryInState(
				entries,
				sourcePath,
				destinationDirPath,
				workspacePath,
				newPath,
			),
		)
		await Promise.all([persistence, documents.renameTab(sourcePath, newPath)])
	}

	const reconcileSavedDocumentRename = (oldPath: string, newPath: string) => {
		registerLocalMutation([
			{ path: oldPath, scope: "exact" },
			{ path: newPath, scope: "exact" },
		])
		void applyPathChange(
			oldPath,
			newPath,
			updateEntryInState(
				getSnapshot().entries,
				oldPath,
				newPath,
				getFileNameFromPath(newPath),
			),
		)
	}

	const updateEntryModifiedDate = async (
		path: string,
		isCurrent = () => true,
	) => {
		const { sessionId } = getSnapshot()
		try {
			const { birthtime, mtime } = await fileSystem.stat(path)
			if (isCurrent() && isCurrentSession(sessionId)) {
				state.update(({ entries }) => ({
					entries: updateEntryMetadata(entries, path, {
						...(birthtime ? { createdAt: new Date(birthtime) } : {}),
						...(mtime ? { modifiedAt: new Date(mtime) } : {}),
					}),
				}))
			}
		} catch (error) {
			console.debug("Failed to update entry metadata:", path, error)
		}
	}

	const tree = {
		getEntryByPath,
		readWorkspaceEntriesFromPath: readEntries,
		refreshWorkspaceEntries,
		reconcileDirectoryEntries,
		entryCreated,
		entriesDeleted,
		entryRenamed,
		entryMoved,
		updateEntryModifiedDate,
	}
	return { tree, syncEntries, persistDirectoryUi, reconcileSavedDocumentRename }
}
