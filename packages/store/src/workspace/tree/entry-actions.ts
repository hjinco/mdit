import type { CollectionSlice } from "../../collection/collection-slice"
import type { TabSlice } from "../../tab/tab-slice"
import {
	addExpandedDirectories,
	removeExpandedDirectories,
	renameExpandedDirectories,
} from "../directory-ui/helpers/expanded-directories"
import {
	removePinsForPaths,
	renamePinnedDirectories,
} from "../directory-ui/helpers/pinned-directories"
import {
	persistExpandedDirectoriesIfChanged,
	persistPinnedDirectoriesIfChanged,
} from "../directory-ui/runtime/persistence"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"
import {
	addEntryToState,
	moveEntryInState,
	removeEntriesFromState,
	sortWorkspaceEntries,
	updateEntryInState,
	updateEntryMetadata,
} from "./domain/entry-tree"

type WorkspaceTreeStoreState = Partial<TabSlice & CollectionSlice> & {
	workspacePath: string | null
	entries: WorkspaceEntry[]
	expandedDirectories: string[]
	pinnedDirectories: string[]
	updateEntries: (
		entries:
			| WorkspaceEntry[]
			| ((entries: WorkspaceEntry[]) => WorkspaceEntry[]),
		options?: { emitEvent?: boolean },
	) => void
}

export type WorkspaceTreeEntryActions = {
	entryCreated: (input: {
		parentPath: string
		entry: WorkspaceEntry
		expandParent?: boolean
		expandNewDirectory?: boolean
	}) => Promise<void>
	entriesDeleted: (input: { paths: string[] }) => Promise<void>
	entryRenamed: (input: {
		oldPath: string
		newPath: string
		isDirectory: boolean
		newName: string
		clearSyncedName?: boolean
	}) => Promise<void>
	entryMoved: (input: {
		sourcePath: string
		destinationDirPath: string
		newPath: string
		isDirectory: boolean
		refreshContent?: boolean
	}) => Promise<void>
	entryImported: (input: {
		destinationDirPath: string
		entry: WorkspaceEntry
		expandIfDirectory?: boolean
	}) => Promise<void>
	updateEntryModifiedDate: (path: string) => Promise<void>
}

export const createTreeEntryActions = (
	ctx: WorkspaceActionContext,
): WorkspaceTreeEntryActions => ({
	entryCreated: async ({
		parentPath,
		entry,
		expandParent = false,
		expandNewDirectory = false,
	}) => {
		const store = ctx.get() as WorkspaceTreeStoreState
		const { workspacePath, entries, expandedDirectories } = store
		if (!workspacePath) throw new Error("Workspace path is not set")

		const nextEntries =
			parentPath === workspacePath
				? sortWorkspaceEntries([...entries, entry])
				: addEntryToState(entries, parentPath, entry)

		store.updateEntries(nextEntries, { emitEvent: false })
		;(store as typeof store & Partial<CollectionSlice>).onEntryCreated?.({
			parentPath,
			entry,
			expandParent,
			expandNewDirectory,
		})

		if (!expandParent && !expandNewDirectory) {
			return
		}

		const nextExpanded = addExpandedDirectories(expandedDirectories, [
			...(expandParent ? [parentPath] : []),
			...(expandNewDirectory ? [entry.path] : []),
		])

		await persistExpandedDirectoriesIfChanged(
			ctx,
			workspacePath,
			expandedDirectories,
			nextExpanded,
		)
	},

	entriesDeleted: async ({ paths }) => {
		const store = ctx.get() as WorkspaceTreeStoreState
		const { workspacePath, entries, expandedDirectories, pinnedDirectories } =
			store
		if (!workspacePath) throw new Error("Workspace path is not set")

		store.updateEntries(removeEntriesFromState(entries, paths), {
			emitEvent: false,
		})
		;(store as typeof store & Partial<TabSlice>).removePathsFromHistory?.(paths)
		;(store as typeof store & Partial<CollectionSlice>).onEntriesDeleted?.({
			paths,
		})

		const nextExpanded = removeExpandedDirectories(expandedDirectories, paths)
		await persistExpandedDirectoriesIfChanged(
			ctx,
			workspacePath,
			expandedDirectories,
			nextExpanded,
		)

		const nextPinned = removePinsForPaths(pinnedDirectories, paths)
		await persistPinnedDirectoriesIfChanged(
			ctx,
			workspacePath,
			pinnedDirectories,
			nextPinned,
		)
	},

	entryRenamed: async ({
		oldPath,
		newPath,
		isDirectory,
		newName,
		clearSyncedName = false,
	}) => {
		const store = ctx.get() as WorkspaceTreeStoreState
		const { workspacePath, entries, expandedDirectories, pinnedDirectories } =
			store
		if (!workspacePath) throw new Error("Workspace path is not set")

		store.updateEntries(
			updateEntryInState(entries, oldPath, newPath, newName),
			{
				emitEvent: false,
			},
		)
		await (store as typeof store & Partial<TabSlice>).renameTab?.(
			oldPath,
			newPath,
			{
				clearSyncedName,
			},
		)
		;(store as typeof store & Partial<TabSlice>).updateHistoryPath?.(
			oldPath,
			newPath,
		)
		;(store as typeof store & Partial<CollectionSlice>).onEntryRenamed?.({
			oldPath,
			newPath,
			isDirectory,
			newName,
		})

		if (!isDirectory) {
			return
		}

		const nextExpanded = renameExpandedDirectories(
			expandedDirectories,
			oldPath,
			newPath,
		)
		await persistExpandedDirectoriesIfChanged(
			ctx,
			workspacePath,
			expandedDirectories,
			nextExpanded,
		)

		const nextPinned = renamePinnedDirectories(
			pinnedDirectories,
			oldPath,
			newPath,
		)
		await persistPinnedDirectoriesIfChanged(
			ctx,
			workspacePath,
			pinnedDirectories,
			nextPinned,
		)
	},

	entryMoved: async ({
		sourcePath,
		destinationDirPath,
		newPath,
		isDirectory,
		refreshContent = false,
	}) => {
		const store = ctx.get() as WorkspaceTreeStoreState
		const { workspacePath, entries, expandedDirectories, pinnedDirectories } =
			store
		if (!workspacePath) throw new Error("Workspace path is not set")

		store.updateEntries(
			moveEntryInState(
				entries,
				sourcePath,
				destinationDirPath,
				workspacePath,
				newPath,
			),
			{ emitEvent: false },
		)
		await (store as typeof store & Partial<TabSlice>).renameTab?.(
			sourcePath,
			newPath,
			{
				refreshContent,
			},
		)
		;(store as typeof store & Partial<TabSlice>).updateHistoryPath?.(
			sourcePath,
			newPath,
		)
		;(store as typeof store & Partial<CollectionSlice>).onEntryMoved?.({
			sourcePath,
			destinationDirPath,
			newPath,
			isDirectory,
		})

		if (isDirectory) {
			const nextExpanded = renameExpandedDirectories(
				expandedDirectories,
				sourcePath,
				newPath,
			)
			await persistExpandedDirectoriesIfChanged(
				ctx,
				workspacePath,
				expandedDirectories,
				nextExpanded,
			)

			const nextPinned = renamePinnedDirectories(
				pinnedDirectories,
				sourcePath,
				newPath,
			)
			await persistPinnedDirectoriesIfChanged(
				ctx,
				workspacePath,
				pinnedDirectories,
				nextPinned,
			)
		}
	},

	entryImported: async ({
		destinationDirPath,
		entry,
		expandIfDirectory = false,
	}) => {
		const { workspacePath, entries, expandedDirectories } = ctx.get()
		if (!workspacePath) throw new Error("Workspace path is not set")

		const nextEntries =
			destinationDirPath === workspacePath
				? sortWorkspaceEntries([...entries, entry])
				: addEntryToState(entries, destinationDirPath, entry)

		ctx.get().updateEntries(nextEntries)

		if (!entry.isDirectory || !expandIfDirectory) {
			return
		}

		const nextExpanded = addExpandedDirectories(expandedDirectories, [
			destinationDirPath,
			entry.path,
		])

		await persistExpandedDirectoriesIfChanged(
			ctx,
			workspacePath,
			expandedDirectories,
			nextExpanded,
		)
	},

	updateEntryModifiedDate: async (path: string) => {
		try {
			const fileMetadata = await ctx.deps.fileSystemRepository.stat(path)
			const metadata: { modifiedAt?: Date; createdAt?: Date } = {}

			if (fileMetadata.mtime) {
				metadata.modifiedAt = new Date(fileMetadata.mtime)
			}
			if (fileMetadata.birthtime) {
				metadata.createdAt = new Date(fileMetadata.birthtime)
			}

			ctx
				.get()
				.updateEntries((entries) =>
					updateEntryMetadata(entries, path, metadata),
				)
		} catch (error) {
			console.debug("Failed to update entry modified date:", path, error)
		}
	},
})
