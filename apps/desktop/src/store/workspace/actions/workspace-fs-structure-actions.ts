import { dirname, join } from "pathe"
import { sanitizeWorkspaceEntryName } from "../helpers/fs-entry-name-helpers"
import { waitForUnsavedTabToSettle } from "../helpers/tab-save-helpers"
import { generateUniqueFileName } from "../helpers/unique-filename-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"

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
			ctx.get().recordFsOperation()

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
		ctx.get().recordFsOperation()

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
		const { tab } = ctx.get()
		const activeTabPath = tab?.path

		if (activeTabPath && paths.includes(activeTabPath)) {
			await waitForUnsavedTabToSettle(activeTabPath, ctx.get)
		}

		if (paths.length === 1) {
			await ctx.deps.fileSystemRepository.moveToTrash(paths[0])
		} else {
			await ctx.deps.fileSystemRepository.moveManyToTrash(paths)
		}
		ctx.get().recordFsOperation()

		await ctx.get().entriesDeleted({ paths })
	},

	deleteEntry: async (path: string) => {
		await ctx.get().deleteEntries([path])
	},

	renameEntry: async (entry, newName) => {
		const trimmedName = sanitizeWorkspaceEntryName(newName)

		if (!trimmedName || trimmedName === entry.name) {
			return entry.path
		}

		await waitForUnsavedTabToSettle(entry.path, ctx.get)

		const directoryPath = dirname(entry.path)
		const nextPath = join(directoryPath, trimmedName)

		if (nextPath === entry.path) {
			return entry.path
		}

		if (await ctx.deps.fileSystemRepository.exists(nextPath)) {
			return entry.path
		}

		await ctx.deps.fileSystemRepository.rename(entry.path, nextPath)
		ctx.get().recordFsOperation()

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
