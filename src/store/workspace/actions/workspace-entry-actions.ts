import { areStringArraysEqual } from "@/utils/array-utils"
import {
	addEntryToState,
	moveEntryInState,
	removeEntriesFromState,
	sortWorkspaceEntries,
	updateEntryInState,
} from "../helpers/entry-helpers"
import {
	addExpandedDirectories,
	removeExpandedDirectories,
	renameExpandedDirectories,
} from "../helpers/expanded-directories-helpers"
import {
	removePinsForPaths,
	renamePinnedDirectories,
} from "../helpers/pinned-directories-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"

const persistExpandedDirectoriesIfChanged = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	previousPaths: string[],
	nextPaths: string[],
) => {
	if (areStringArraysEqual(previousPaths, nextPaths)) {
		return
	}

	ctx.set({ expandedDirectories: nextPaths })
	await ctx.deps.settingsRepository.persistExpandedDirectories(
		workspacePath,
		nextPaths,
	)
}

const persistPinnedDirectoriesIfChanged = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	previousPaths: string[],
	nextPaths: string[],
) => {
	if (areStringArraysEqual(previousPaths, nextPaths)) {
		return
	}

	ctx.set({ pinnedDirectories: nextPaths })
	await ctx.deps.settingsRepository.persistPinnedDirectories(
		workspacePath,
		nextPaths,
	)
}

export const createWorkspaceEntryActions = (
	ctx: WorkspaceActionContext,
): Pick<
	WorkspaceSlice,
	| "entryCreated"
	| "entriesDeleted"
	| "entryRenamed"
	| "entryMoved"
	| "entryImported"
> => ({
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
		const {
			workspacePath,
			entries,
			expandedDirectories,
			pinnedDirectories,
			tab,
		} = ctx.get()
		if (!workspacePath) throw new Error("Workspace path is not set")

		if (tab && paths.includes(tab.path)) {
			ctx.ports.tab.closeTab(tab.path)
		}

		for (const path of paths) {
			ctx.ports.tab.removePathFromHistory(path)
		}

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
})
