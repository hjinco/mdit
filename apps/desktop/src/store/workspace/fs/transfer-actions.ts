import { basename, join } from "pathe"
import { getFileNameFromPath } from "@/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"
import {
	arePathsInsideWorkspace,
	hasLockedPathConflict,
	isMovingIntoDescendantPath,
	isPathInsideWorkspace,
	resolveLockPathsForSource,
} from "./guards"
import { generateUniqueFileName } from "./helpers/unique-filename-helpers"
import { waitForActiveTabPathToSettle } from "./tab-guards"

export type MoveEntryOptions = {
	onConflict?: "fail" | "auto-rename"
	allowLockedSourcePath?: boolean
	onMoved?: (newPath: string) => void
}

export type WorkspaceFsTransferActions = {
	moveEntry: (
		sourcePath: string,
		destinationPath: string,
		options?: MoveEntryOptions,
	) => Promise<boolean>
	copyEntry: (sourcePath: string, destinationPath: string) => Promise<boolean>
	moveExternalEntry: (
		sourcePath: string,
		destinationPath: string,
	) => Promise<boolean>
}

type ImportTransferredEntryInput = {
	destinationDirPath: string
	sourceFileName: string
	newPath: string
	isDirectory: boolean
	operation: "copy" | "move"
}

type WorkspaceEntryMetadata = {
	createdAt?: Date
	modifiedAt?: Date
}

const readWorkspaceEntryMetadata = async (
	ctx: WorkspaceActionContext,
	path: string,
): Promise<WorkspaceEntryMetadata> => {
	const statResult = await ctx.deps.fileSystemRepository.stat(path)

	return {
		...(statResult.birthtime
			? { createdAt: new Date(statResult.birthtime) }
			: {}),
		...(statResult.mtime ? { modifiedAt: new Date(statResult.mtime) } : {}),
	}
}

const loadDirectoryChildrenForTransfer = async (
	ctx: WorkspaceActionContext,
	path: string,
	operation: "copy" | "move",
) => {
	try {
		return await ctx.get().readWorkspaceEntriesFromPath(path)
	} catch (error) {
		console.error(
			`Failed to load directory children after ${operation}:`,
			error,
		)
		return []
	}
}

const importTransferredEntry = async (
	ctx: WorkspaceActionContext,
	input: ImportTransferredEntryInput,
) => {
	const fileMetadata = await readWorkspaceEntryMetadata(ctx, input.newPath)
	const directoryChildren = input.isDirectory
		? await loadDirectoryChildrenForTransfer(
				ctx,
				input.newPath,
				input.operation,
			)
		: undefined
	const newFileName = getFileNameFromPath(input.newPath) ?? input.sourceFileName

	await ctx.get().entryImported({
		destinationDirPath: input.destinationDirPath,
		entry: {
			path: input.newPath,
			name: newFileName,
			isDirectory: input.isDirectory,
			children: directoryChildren,
			createdAt: fileMetadata.createdAt,
			modifiedAt: fileMetadata.modifiedAt,
		},
		expandIfDirectory: input.isDirectory,
	})
}

export const createFsTransferActions = (
	ctx: WorkspaceActionContext,
): WorkspaceFsTransferActions => ({
	moveEntry: async (
		sourcePath: string,
		destinationPath: string,
		options?: MoveEntryOptions,
	): Promise<boolean> => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath) {
			throw new Error("Workspace path is not set")
		}

		const lockPathsToCheck = resolveLockPathsForSource(
			ctx.get().aiLockedEntryPaths,
			sourcePath,
			options?.allowLockedSourcePath,
		)
		if (hasLockedPathConflict([sourcePath], lockPathsToCheck)) {
			return false
		}

		if (sourcePath === destinationPath) {
			return false
		}

		if (isMovingIntoDescendantPath(sourcePath, destinationPath)) {
			return false
		}

		if (
			!arePathsInsideWorkspace([sourcePath, destinationPath], workspacePath)
		) {
			return false
		}

		try {
			await waitForActiveTabPathToSettle(ctx, sourcePath)

			const entryToMove = ctx.get().getEntryByPath(sourcePath)
			if (!entryToMove) {
				return false
			}

			const isDirectory = entryToMove.isDirectory
			const entryName = basename(sourcePath)
			const onConflict = options?.onConflict ?? "fail"
			let newPath = join(destinationPath, entryName)

			if (await ctx.deps.fileSystemRepository.exists(newPath)) {
				if (onConflict === "fail") {
					return false
				}

				const generated = await generateUniqueFileName(
					entryName,
					destinationPath,
					ctx.deps.fileSystemRepository.exists,
					{ pattern: "parentheses" },
				)
				newPath = generated.fullPath
			}

			await ctx.deps.fileSystemRepository.rename(sourcePath, newPath)
			const scope = isDirectory ? "subtree" : "exact"
			ctx.get().registerLocalMutation([
				{ path: sourcePath, scope },
				{ path: newPath, scope },
			])

			await ctx.get().entryMoved({
				sourcePath,
				destinationDirPath: destinationPath,
				newPath,
				isDirectory,
				refreshContent: false,
			})

			try {
				options?.onMoved?.(newPath)
			} catch (callbackError) {
				console.error(
					"onMoved callback failed after successful move:",
					sourcePath,
					destinationPath,
					callbackError,
				)
			}

			return true
		} catch (error) {
			console.error("Failed to move entry:", sourcePath, destinationPath, error)
			return false
		}
	},

	copyEntry: async (sourcePath: string, destinationPath: string) => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath) {
			return false
		}

		if (sourcePath === destinationPath) {
			return false
		}

		if (!isPathInsideWorkspace(destinationPath, workspacePath)) {
			return false
		}

		const fileName = getFileNameFromPath(sourcePath)
		if (!fileName) {
			return false
		}

		try {
			const { fullPath: newPath } = await generateUniqueFileName(
				fileName,
				destinationPath,
				ctx.deps.fileSystemRepository.exists,
				{ pattern: "parentheses" },
			)

			const sourceStat = await ctx.deps.fileSystemRepository.stat(sourcePath)
			const isDirectory = sourceStat.isDirectory

			await ctx.deps.fileSystemRepository.copy(sourcePath, newPath)
			ctx
				.get()
				.registerLocalMutation([
					{ path: newPath, scope: isDirectory ? "subtree" : "exact" },
				])

			await importTransferredEntry(ctx, {
				destinationDirPath: destinationPath,
				sourceFileName: fileName,
				newPath,
				isDirectory,
				operation: "copy",
			})

			return true
		} catch (error) {
			console.error("Failed to copy entry:", sourcePath, destinationPath, error)
			return false
		}
	},

	moveExternalEntry: async (sourcePath: string, destinationPath: string) => {
		if (!ctx.get().workspacePath) {
			return false
		}

		const fileName = getFileNameFromPath(sourcePath)
		if (!fileName) {
			return false
		}

		try {
			const { fullPath: newPath } = await generateUniqueFileName(
				fileName,
				destinationPath,
				ctx.deps.fileSystemRepository.exists,
				{ pattern: "parentheses" },
			)

			const sourceStat = await ctx.deps.fileSystemRepository.stat(sourcePath)
			const isDirectory = sourceStat.isDirectory

			await ctx.deps.fileSystemRepository.rename(sourcePath, newPath)
			ctx
				.get()
				.registerLocalMutation([
					{ path: newPath, scope: isDirectory ? "subtree" : "exact" },
				])

			await importTransferredEntry(ctx, {
				destinationDirPath: destinationPath,
				sourceFileName: fileName,
				newPath,
				isDirectory,
				operation: "move",
			})

			return true
		} catch (error) {
			console.error(
				"Failed to move external entry:",
				sourcePath,
				destinationPath,
				error,
			)
			return false
		}
	},
})
