import { isPathEqualOrDescendant } from "@/utils/path-utils"
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
		const { workspacePath, entries, expandedDirectories } = ctx.get()
		if (!workspacePath) throw new Error("Workspace path is not set")

		const nextEntries =
			parentPath === workspacePath
				? sortWorkspaceEntries([...entries, entry])
				: addEntryToState(entries, parentPath, entry)

		ctx.get().updateEntries(nextEntries)
		ctx.ports.collection.onEntryCreated({
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
		const { workspacePath, entries, expandedDirectories, pinnedDirectories } =
			ctx.get()
		if (!workspacePath) throw new Error("Workspace path is not set")
		const activeTabPath = ctx.ports.tab.getActiveTabPath()

		if (
			activeTabPath &&
			paths.some((path) => isPathEqualOrDescendant(activeTabPath, path))
		) {
			ctx.ports.tab.closeTab(activeTabPath)
		}

		ctx.ports.tab.removePathsFromHistory(paths)

		ctx.get().updateEntries(removeEntriesFromState(entries, paths))

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

		ctx.ports.collection.onEntriesDeleted({ paths })
	},

	entryRenamed: async ({ oldPath, newPath, isDirectory, newName }) => {
		const { workspacePath, entries, expandedDirectories, pinnedDirectories } =
			ctx.get()
		if (!workspacePath) throw new Error("Workspace path is not set")

		await ctx.ports.tab.renameTab(oldPath, newPath)
		ctx.ports.tab.updateHistoryPath(oldPath, newPath)

		ctx
			.get()
			.updateEntries(updateEntryInState(entries, oldPath, newPath, newName))

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

		ctx.ports.collection.onEntryRenamed({
			oldPath,
			newPath,
			isDirectory,
			newName,
		})
	},

	entryMoved: async ({
		sourcePath,
		destinationDirPath,
		newPath,
		isDirectory,
		refreshContent = false,
	}) => {
		const { workspacePath, entries, expandedDirectories, pinnedDirectories } =
			ctx.get()
		if (!workspacePath) throw new Error("Workspace path is not set")

		await ctx.ports.tab.renameTab(sourcePath, newPath, {
			refreshContent,
		})
		ctx.ports.tab.updateHistoryPath(sourcePath, newPath)

		ctx
			.get()
			.updateEntries(
				moveEntryInState(
					entries,
					sourcePath,
					destinationDirPath,
					workspacePath,
					newPath,
				),
			)

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

		ctx.ports.collection.onEntryMoved({
			sourcePath,
			destinationDirPath,
			newPath,
			isDirectory,
		})
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
