import { dirname, join, relative } from "pathe"
import { sanitizeWorkspaceEntryName } from "../helpers/fs-entry-name-helpers"
import {
	doesWikiTargetReferToRelPath,
	isExternalWikiTarget,
	isMarkdownNotePath,
	normalizeSlashes,
	resolveSourcePath,
	splitWikiTargetSuffix,
	toWikiTargetFromAbsolutePath,
	withPreservedSurroundingWhitespace,
} from "../helpers/fs-structure-helpers"
import {
	collectWikiLinkTargets,
	rewriteMarkdownLinksForRenamedTarget,
	rewriteWikiLinkTargets,
} from "../helpers/markdown-link-helpers"
import { waitForUnsavedTabToSettle } from "../helpers/tab-save-helpers"
import { generateUniqueFileName } from "../helpers/unique-filename-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"

const rewriteBacklinkDocument = async (
	ctx: WorkspaceActionContext,
	input: {
		workspacePath: string
		sourcePath: string
		oldNotePath: string
		newNotePath: string
		oldRelPath: string
		newWikiTarget: string
	},
) => {
	const originalContent = await ctx.deps.fileSystemRepository.readTextFile(
		input.sourcePath,
	)

	let updatedContent = rewriteMarkdownLinksForRenamedTarget(
		originalContent,
		dirname(input.sourcePath),
		input.oldNotePath,
		input.newNotePath,
	)

	const wikiTargets = collectWikiLinkTargets(updatedContent)
	if (wikiTargets.length > 0) {
		const replacements = new Map<string, string>()

		for (const rawWikiTarget of wikiTargets) {
			const trimmedTarget = rawWikiTarget.trim()
			if (!trimmedTarget || isExternalWikiTarget(trimmedTarget)) {
				continue
			}

			try {
				const resolved = await ctx.deps.linkIndexing.resolveWikiLink({
					workspacePath: input.workspacePath,
					currentNotePath: input.sourcePath,
					rawTarget: trimmedTarget,
				})

				const matchesByResolver =
					normalizeSlashes(resolved.resolvedRelPath ?? "") === input.oldRelPath
				const matchesByFallback =
					resolved.unresolved &&
					doesWikiTargetReferToRelPath(trimmedTarget, input.oldRelPath)

				if (!matchesByResolver && !matchesByFallback) {
					continue
				}

				const { suffix } = splitWikiTargetSuffix(trimmedTarget)
				replacements.set(
					rawWikiTarget,
					withPreservedSurroundingWhitespace(
						rawWikiTarget,
						`${input.newWikiTarget}${suffix}`,
					),
				)
			} catch (error) {
				console.warn("Failed to resolve wiki target while renaming note:", {
					sourcePath: input.sourcePath,
					rawWikiTarget: trimmedTarget,
					error,
				})
			}
		}

		if (replacements.size > 0) {
			updatedContent = rewriteWikiLinkTargets(updatedContent, replacements)
		}
	}

	if (updatedContent === originalContent) {
		return false
	}

	await ctx.deps.fileSystemRepository.writeTextFile(
		input.sourcePath,
		updatedContent,
	)
	ctx.get().recordFsOperation()
	return true
}

const syncBacklinksAndLinkIndex = async (
	ctx: WorkspaceActionContext,
	input: {
		workspacePath: string
		oldNotePath: string
		newNotePath: string
	},
) => {
	const warnings: string[] = []
	const oldRelPath = normalizeSlashes(
		relative(input.workspacePath, input.oldNotePath),
	)
	const newWikiTarget = toWikiTargetFromAbsolutePath(
		input.workspacePath,
		input.newNotePath,
	)

	let backlinks = [] as { relPath: string; fileName: string }[]
	try {
		backlinks = await ctx.deps.linkIndexing.getBacklinks(
			input.workspacePath,
			input.oldNotePath,
		)
	} catch (error) {
		console.warn(
			"Failed to load backlinks before note rename indexing sync:",
			error,
		)
		warnings.push("load-backlinks")
	}

	let backlinksToNewTarget = [] as { relPath: string; fileName: string }[]
	try {
		backlinksToNewTarget = await ctx.deps.linkIndexing.getBacklinks(
			input.workspacePath,
			input.newNotePath,
		)
	} catch (error) {
		console.warn(
			"Failed to load unresolved backlinks for new note path before rename indexing sync:",
			error,
		)
		warnings.push("load-new-backlinks")
	}

	const indexTargets = new Set<string>([normalizeSlashes(input.newNotePath)])
	for (const backlink of backlinks) {
		const sourcePath = resolveSourcePath(
			input.workspacePath,
			backlink.relPath,
			input.oldNotePath,
			input.newNotePath,
		)

		if (!isMarkdownNotePath(sourcePath)) {
			continue
		}

		indexTargets.add(normalizeSlashes(sourcePath))

		try {
			await rewriteBacklinkDocument(ctx, {
				workspacePath: input.workspacePath,
				sourcePath,
				oldNotePath: input.oldNotePath,
				newNotePath: input.newNotePath,
				oldRelPath,
				newWikiTarget,
			})
		} catch (error) {
			console.warn("Failed to rewrite backlink document after note rename:", {
				sourcePath,
				error,
			})
			warnings.push(`rewrite:${sourcePath}`)
		}
	}

	for (const backlink of backlinksToNewTarget) {
		const sourcePath = resolveSourcePath(
			input.workspacePath,
			backlink.relPath,
			input.oldNotePath,
			input.newNotePath,
		)

		if (!isMarkdownNotePath(sourcePath)) {
			continue
		}

		indexTargets.add(normalizeSlashes(sourcePath))
	}

	try {
		await ctx.deps.linkIndexing.renameIndexedNote(
			input.workspacePath,
			input.oldNotePath,
			input.newNotePath,
		)
	} catch (error) {
		console.warn(
			"Failed to rename indexed note path after filesystem rename:",
			{
				oldPath: input.oldNotePath,
				newPath: input.newNotePath,
				error,
			},
		)
		warnings.push("rename-indexed-note")
	}

	for (const notePath of indexTargets) {
		try {
			await ctx.deps.linkIndexing.indexNote(input.workspacePath, notePath)
		} catch (error) {
			console.warn("Failed to refresh link index for note after rename:", {
				notePath,
				error,
			})
			warnings.push(`index:${notePath}`)
		}
	}

	if (warnings.length > 0) {
		console.warn("Rename completed with silent warnings.", {
			oldPath: input.oldNotePath,
			newPath: input.newNotePath,
			warnings,
		})
	}
}

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

		const workspacePath = ctx.get().workspacePath
		const shouldSyncBacklinks =
			workspacePath &&
			!entry.isDirectory &&
			isMarkdownNotePath(entry.path) &&
			isMarkdownNotePath(nextPath)

		if (shouldSyncBacklinks) {
			await syncBacklinksAndLinkIndex(ctx, {
				workspacePath,
				oldNotePath: entry.path,
				newNotePath: nextPath,
			})
		}

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
