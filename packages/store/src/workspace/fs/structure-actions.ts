import { dirname, join } from "pathe"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"
import { getActiveTabPathForWorkspacePolicy } from "../workspace-tab-policy"
import { hasLockedPathConflict, resolveLockPathsForSource } from "./guards"
import { sanitizeWorkspaceEntryName } from "./helpers/fs-entry-name-helpers"
import { generateUniqueFileName } from "./helpers/unique-filename-helpers"
import {
	waitForActiveTabDescendantToSettle,
	waitForActiveTabUnderPathsToSettle,
} from "./tab-guards"

export type CreateNoteOptions = {
	initialName?: string
	initialContent?: string
	openTab?: boolean
}

export type RenameEntryOptions = {
	allowLockedSourcePath?: boolean
	preserveActiveTabSyncedName?: boolean
}

export type WorkspaceFsStructureActions = {
	createFolder: (
		directoryPath: string,
		folderName: string,
	) => Promise<string | null>
	createNote: (
		directoryPath: string,
		options?: CreateNoteOptions,
	) => Promise<string>
	createAndOpenNote: () => Promise<void>
	deleteEntries: (paths: string[]) => Promise<void>
	deleteEntry: (path: string) => Promise<void>
	renameEntry: (
		entry: WorkspaceEntry,
		newName: string,
		options?: RenameEntryOptions,
	) => Promise<string>
}

const createSingleEntrySelection = (path: string) => ({
	selectedIds: new Set([path]),
	anchorId: path,
})

const registerExactLocalMutation = (
	ctx: WorkspaceActionContext,
	path: string,
) => {
	ctx.get().registerLocalMutation([{ path, scope: "exact" }])
}

const createUniqueEntryPath = (
	ctx: WorkspaceActionContext,
	baseName: string,
	directoryPath: string,
) =>
	generateUniqueFileName(
		baseName,
		directoryPath,
		ctx.deps.fileSystemRepository.exists,
		{ pattern: "space" },
	)

export const createFsStructureActions = (
	ctx: WorkspaceActionContext,
): WorkspaceFsStructureActions => ({
	createFolder: async (directoryPath: string, folderName: string) => {
		const trimmedName = sanitizeWorkspaceEntryName(folderName)
		if (!trimmedName) {
			return null
		}

		try {
			const { fileName: finalFolderName, fullPath: folderPath } =
				await createUniqueEntryPath(ctx, trimmedName, directoryPath)

			await ctx.deps.fileSystemRepository.mkdir(folderPath, {
				recursive: true,
			})
			registerExactLocalMutation(ctx, folderPath)

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

			ctx.get().setEntrySelection(createSingleEntrySelection(folderPath))

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
		const { fileName, fullPath: filePath } = await createUniqueEntryPath(
			ctx,
			baseName,
			directoryPath,
		)

		await ctx.deps.fileSystemRepository.writeTextFile(
			filePath,
			options?.initialContent ?? "",
		)
		registerExactLocalMutation(ctx, filePath)

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
			await ctx.runtime.events.emit({
				type: "workspace/note-created",
				workspacePath: ctx.get().workspacePath,
				path: filePath,
			})
			ctx.get().setEntrySelection(createSingleEntrySelection(filePath))
		}

		return filePath
	},

	createAndOpenNote: async () => {
		const { workspacePath } = ctx.get()
		if (!workspacePath) {
			return
		}

		const currentCollectionPath =
			ctx.ports.collection.getCurrentCollectionPath()
		const activeTabPath = getActiveTabPathForWorkspacePolicy(ctx)
		let targetDirectory = workspacePath

		if (currentCollectionPath) {
			targetDirectory = currentCollectionPath
		} else if (activeTabPath) {
			targetDirectory = dirname(activeTabPath)
		}

		await ctx.get().createNote(targetDirectory, { openTab: true })
	},

	deleteEntries: async (paths: string[]) => {
		if (hasLockedPathConflict(paths, ctx.get().aiLockedEntryPaths)) {
			return
		}

		await waitForActiveTabUnderPathsToSettle(ctx, paths)

		if (paths.length === 1) {
			await ctx.deps.fileSystemRepository.moveToTrash(paths[0])
		} else {
			await ctx.deps.fileSystemRepository.moveManyToTrash(paths)
		}
		ctx
			.get()
			.registerLocalMutation(paths.map((path) => ({ path, scope: "subtree" })))

		await ctx.get().entriesDeleted({ paths })
	},

	deleteEntry: async (path: string) => {
		await ctx.get().deleteEntries([path])
	},

	renameEntry: async (entry, newName, options) => {
		const lockPathsToCheck = resolveLockPathsForSource(
			ctx.get().aiLockedEntryPaths,
			entry.path,
			options?.allowLockedSourcePath,
		)
		if (hasLockedPathConflict([entry.path], lockPathsToCheck)) {
			return entry.path
		}

		const trimmedName = sanitizeWorkspaceEntryName(newName)
		if (!trimmedName || trimmedName === entry.name) {
			return entry.path
		}

		await waitForActiveTabDescendantToSettle(ctx, entry.path)

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

		const { workspacePath, isEditMode } = ctx.get()
		if (!workspacePath) {
			throw new Error("Workspace path is not set")
		}

		await ctx.deps.fileSystemRepository.rename(entry.path, nextPath)
		const scope = entry.isDirectory ? "subtree" : "exact"
		ctx.get().registerLocalMutation([
			{ path: entry.path, scope },
			{ path: nextPath, scope },
		])
		const clearSyncedName =
			!entry.isDirectory && !options?.preserveActiveTabSyncedName

		if (isEditMode) {
			await ctx.runtime.events.emit({
				type: "workspace/tab-path-renamed",
				workspacePath,
				oldPath: entry.path,
				newPath: nextPath,
				clearSyncedName,
			})
			return nextPath
		}

		await ctx.get().entryRenamed({
			oldPath: entry.path,
			newPath: nextPath,
			isDirectory: entry.isDirectory,
			newName: trimmedName,
			clearSyncedName,
		})

		return nextPath
	},
})
