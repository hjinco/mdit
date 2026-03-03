import { dirname, join } from "pathe"
import {
	hasPathConflictWithLockedPaths,
	isPathEqualOrDescendant,
} from "@/utils/path-utils"
import { sanitizeWorkspaceEntryName } from "../helpers/fs-entry-name-helpers"
import { waitForUnsavedTabToSettle } from "../helpers/tab-save-helpers"
import { generateUniqueFileName } from "../helpers/unique-filename-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"
import {
	registerExactLocalMutation,
	registerMoveLocalMutation,
	registerSubtreeLocalMutations,
} from "./workspace-local-mutation-helpers"

export const createWorkspaceFsStructureActions = (
	ctx: WorkspaceActionContext,
): Pick<
	WorkspaceSlice,
	| "createFolder"
	| "createNote"
	| "createAndOpenNote"
	| "deleteEntries"
	| "deleteEntry"
	| "renameEntry"
> => ({
	createFolder: async (directoryPath: string, folderName: string) => {
		const trimmedName = sanitizeWorkspaceEntryName(folderName)
		if (!trimmedName) {
			return null
		}

		try {
			const { fileName: finalFolderName, fullPath: folderPath } =
				await generateUniqueFileName(
					trimmedName,
					directoryPath,
					ctx.deps.fileSystemRepository.exists,
					{
						pattern: "space",
					},
				)

			await ctx.deps.fileSystemRepository.mkdir(folderPath, {
				recursive: true,
			})
			registerExactLocalMutation(ctx.get().registerLocalMutation, folderPath)

			await ctx.get().entryCreated({
				parentPath: directoryPath,
				entry: {
					path: folderPath,
					name: finalFolderName,
					isDirectory: true,
					children: [],
					createdAt: undefined,
					modifiedAt: undefined,
				},
				expandParent: true,
				expandNewDirectory: true,
			})

			ctx.get().setSelectedEntryPaths(new Set([folderPath]))
			ctx.get().setSelectionAnchorPath(folderPath)

			return folderPath
		} catch (error) {
			console.error("Failed to create folder with name:", error)
			return null
		}
	},

	createNote: async (directoryPath, options) => {
		const sanitizedBaseName = sanitizeWorkspaceEntryName(
			options?.initialName ?? "Untitled",
		)
		if (!sanitizedBaseName) {
			throw new Error("Note name is empty after sanitization.")
		}

		const baseName = `${sanitizedBaseName}.md`
		const { fileName, fullPath: filePath } = await generateUniqueFileName(
			baseName,
			directoryPath,
			ctx.deps.fileSystemRepository.exists,
			{ pattern: "space" },
		)

		await ctx.deps.fileSystemRepository.writeTextFile(
			filePath,
			options?.initialContent ?? "",
		)
		registerExactLocalMutation(ctx.get().registerLocalMutation, filePath)

		const now = new Date()

		await ctx.get().entryCreated({
			parentPath: directoryPath,
			entry: {
				path: filePath,
				name: fileName,
				isDirectory: false,
				children: undefined,
				createdAt: now,
				modifiedAt: now,
			},
		})

		if (options?.openTab) {
			await ctx.ports.tab.openTab(filePath)
			ctx.get().setSelectedEntryPaths(new Set([filePath]))
			ctx.get().setSelectionAnchorPath(filePath)
		}

		return filePath
	},

	createAndOpenNote: async () => {
		const { workspacePath } = ctx.get()

		if (!workspacePath) {
			return
		}

		const { tab, currentCollectionPath } = ctx.get()
		let targetDirectory = workspacePath

		if (currentCollectionPath) {
			targetDirectory = currentCollectionPath
		} else if (tab) {
			targetDirectory = dirname(tab.path)
		}

		const newNotePath = await ctx.get().createNote(targetDirectory)
		await ctx.ports.tab.openTab(newNotePath)
	},

	deleteEntries: async (paths: string[]) => {
		const { tab, aiLockedEntryPaths } = ctx.get()
		if (hasPathConflictWithLockedPaths(paths, aiLockedEntryPaths)) {
			return
		}
		const activeTabPath = tab?.path

		if (
			activeTabPath &&
			paths.some((path) => isPathEqualOrDescendant(activeTabPath, path))
		) {
			await waitForUnsavedTabToSettle(activeTabPath, ctx.get)
		}

		if (paths.length === 1) {
			await ctx.deps.fileSystemRepository.moveToTrash(paths[0])
		} else {
			await ctx.deps.fileSystemRepository.moveManyToTrash(paths)
		}
		registerSubtreeLocalMutations(ctx.get().registerLocalMutation, paths)

		await ctx.get().entriesDeleted({ paths })
	},

	deleteEntry: async (path: string) => {
		await ctx.get().deleteEntries([path])
	},

	renameEntry: async (
		entry,
		newName,
		options?: { allowLockedSourcePath?: boolean },
	) => {
		const lockPathsToCheck = options?.allowLockedSourcePath
			? new Set(
					Array.from(ctx.get().aiLockedEntryPaths).filter(
						(lockedPath) => lockedPath !== entry.path,
					),
				)
			: ctx.get().aiLockedEntryPaths
		if (hasPathConflictWithLockedPaths([entry.path], lockPathsToCheck)) {
			return entry.path
		}

		const trimmedName = sanitizeWorkspaceEntryName(newName)

		if (!trimmedName || trimmedName === entry.name) {
			return entry.path
		}

		const activeTabPath = ctx.get().tab?.path
		if (activeTabPath && isPathEqualOrDescendant(activeTabPath, entry.path)) {
			await waitForUnsavedTabToSettle(activeTabPath, ctx.get)
		}

		const directoryPath = dirname(entry.path)
		const nextPath = join(directoryPath, trimmedName)

		if (nextPath === entry.path) {
			return entry.path
		}

		const isCaseOnlyRename = entry.path.toLowerCase() === nextPath.toLowerCase()

		if (
			(await ctx.deps.fileSystemRepository.exists(nextPath)) &&
			!isCaseOnlyRename
		) {
			return entry.path
		}

		// On case-insensitive filesystems (macOS default), case-only rename can report exists().
		await ctx.deps.fileSystemRepository.rename(entry.path, nextPath)
		registerMoveLocalMutation(ctx.get().registerLocalMutation, {
			sourcePath: entry.path,
			targetPath: nextPath,
			isDirectory: entry.isDirectory,
		})

		if (ctx.get().isEditMode) {
			await ctx.ports.tab.renameTab(entry.path, nextPath)
			return nextPath
		}

		await ctx.get().entryRenamed({
			oldPath: entry.path,
			newPath: nextPath,
			isDirectory: entry.isDirectory,
			newName: trimmedName,
		})

		return nextPath
	},
})
