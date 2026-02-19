import { basename, dirname, join } from "pathe"
import {
	getFileNameFromPath,
	isPathEqualOrDescendant,
} from "@/utils/path-utils"
import {
	buildWorkspaceEntries,
	findEntryByPath,
} from "../helpers/entry-helpers"
import { rewriteMarkdownRelativeLinks } from "../helpers/markdown-link-helpers"
import { waitForUnsavedTabToSettle } from "../helpers/tab-save-helpers"
import { generateUniqueFileName } from "../helpers/unique-filename-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry, WorkspaceSlice } from "../workspace-slice"

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
): Promise<WorkspaceEntry[]> => {
	try {
		return await buildWorkspaceEntries(path, ctx.deps.fileSystemRepository)
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
	input: {
		destinationDirPath: string
		sourceFileName: string
		newPath: string
		isDirectory: boolean
		operation: "copy" | "move"
	},
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

export const createWorkspaceFsTransferActions = (
	ctx: WorkspaceActionContext,
): Pick<WorkspaceSlice, "moveEntry" | "copyEntry" | "moveExternalEntry"> => ({
	moveEntry: async (sourcePath: string, destinationPath: string) => {
		const { workspacePath } = ctx.get()

		if (!workspacePath) throw new Error("Workspace path is not set")

		if (sourcePath === destinationPath) {
			return false
		}

		if (isPathEqualOrDescendant(destinationPath, sourcePath)) {
			return false
		}

		const sourceInWorkspace = isPathEqualOrDescendant(sourcePath, workspacePath)
		const destinationInWorkspace = isPathEqualOrDescendant(
			destinationPath,
			workspacePath,
		)

		if (!sourceInWorkspace || !destinationInWorkspace) {
			return false
		}

		try {
			await waitForUnsavedTabToSettle(sourcePath, ctx.get)

			const entryToMove = findEntryByPath(ctx.get().entries, sourcePath)

			if (!entryToMove) {
				return false
			}

			const isDirectory = entryToMove.isDirectory
			const entryName = basename(sourcePath)
			const newPath = join(destinationPath, entryName)

			if (await ctx.deps.fileSystemRepository.exists(newPath)) {
				return false
			}

			let markdownRewriteContext: {
				content: string
				sourceDir: string
			} | null = null
			let shouldRefreshTab = false

			if (entryName.endsWith(".md")) {
				try {
					const sourceDirectory = dirname(sourcePath)
					if (sourceDirectory !== destinationPath) {
						const noteContent =
							await ctx.deps.fileSystemRepository.readTextFile(sourcePath)
						markdownRewriteContext = {
							content: noteContent,
							sourceDir: sourceDirectory,
						}
					}
				} catch (error) {
					console.error("Failed to prepare markdown link updates:", error)
				}
			}

			await ctx.deps.fileSystemRepository.rename(sourcePath, newPath)
			ctx.get().recordFsOperation()

			if (markdownRewriteContext) {
				try {
					const updatedContent = rewriteMarkdownRelativeLinks(
						markdownRewriteContext.content,
						markdownRewriteContext.sourceDir,
						destinationPath,
					)

					if (updatedContent !== markdownRewriteContext.content) {
						await ctx.deps.fileSystemRepository.writeTextFile(
							newPath,
							updatedContent,
						)
						shouldRefreshTab = true
					}
				} catch (error) {
					console.error("Failed to rewrite markdown links after move:", error)
				}
			}

			await ctx.get().entryMoved({
				sourcePath,
				destinationDirPath: destinationPath,
				newPath,
				isDirectory,
				refreshContent: shouldRefreshTab,
			})

			return true
		} catch (error) {
			console.error("Failed to move entry:", sourcePath, destinationPath, error)
			return false
		}
	},

	copyEntry: async (sourcePath: string, destinationPath: string) => {
		const { workspacePath } = ctx.get()

		if (!workspacePath) {
			return false
		}

		if (sourcePath === destinationPath) {
			return false
		}

		const destinationInWorkspace = isPathEqualOrDescendant(
			destinationPath,
			workspacePath,
		)

		if (!destinationInWorkspace) {
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
			ctx.get().recordFsOperation()

			if (fileName.endsWith(".md")) {
				const sourceDirectory = dirname(sourcePath)
				if (sourceDirectory !== destinationPath) {
					const content =
						await ctx.deps.fileSystemRepository.readTextFile(newPath)
					const updatedContent = rewriteMarkdownRelativeLinks(
						content,
						sourceDirectory,
						destinationPath,
					)

					if (updatedContent !== content) {
						await ctx.deps.fileSystemRepository.writeTextFile(
							newPath,
							updatedContent,
						)
					}
				}
			}

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
		const { workspacePath } = ctx.get()

		if (!workspacePath) {
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
			ctx.get().recordFsOperation()

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
