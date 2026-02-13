import { dirname } from "pathe"
import { updateEntryMetadata } from "../helpers/entry-helpers"
import { generateUniqueFileName } from "../helpers/unique-filename-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"

export const createWorkspaceFsNoteActions = (
	ctx: WorkspaceActionContext,
): Pick<
	WorkspaceSlice,
	| "recordFsOperation"
	| "saveNoteContent"
	| "updateFrontmatter"
	| "renameFrontmatterProperty"
	| "removeFrontmatterProperty"
	| "renameNoteWithAI"
	| "updateEntryModifiedDate"
> => ({
	recordFsOperation: () => {
		ctx.set({ lastFsOperationTime: Date.now() })
	},

	saveNoteContent: async (path: string, contents: string) => {
		await ctx.deps.fileSystemRepository.writeTextFile(path, contents)
		ctx.get().recordFsOperation()
	},

	updateFrontmatter: async (path: string, updates: Record<string, unknown>) => {
		await ctx.deps.frontmatterUtils.updateFileFrontmatter(path, updates)
		ctx.get().recordFsOperation()
		await ctx.get().updateEntryModifiedDate(path)
	},

	renameFrontmatterProperty: async (
		path: string,
		oldKey: string,
		newKey: string,
	) => {
		await ctx.deps.frontmatterUtils.renameFileFrontmatterProperty(
			path,
			oldKey,
			newKey,
		)
		ctx.get().recordFsOperation()
		await ctx.get().updateEntryModifiedDate(path)
	},

	removeFrontmatterProperty: async (path: string, key: string) => {
		await ctx.deps.frontmatterUtils.removeFileFrontmatterProperty(path, key)
		ctx.get().recordFsOperation()
		await ctx.get().updateEntryModifiedDate(path)
	},

	renameNoteWithAI: async (entry) => {
		const { renameConfig } = ctx.get()

		if (!renameConfig) {
			return
		}

		if (entry.isDirectory || !entry.path.endsWith(".md")) {
			return
		}

		const [dirPath, rawContent] = await Promise.all([
			dirname(entry.path),
			ctx.deps.fileSystemRepository.readTextFile(entry.path),
		])

		const dirEntries = await ctx.deps.fileSystemRepository.readDir(dirPath)
		const otherNoteNames = ctx.deps.aiRenameHelpers.collectSiblingNoteNames(
			dirEntries,
			entry.name,
		)

		const model = ctx.deps.aiRenameHelpers.createModelFromConfig(renameConfig)
		const aiResponse = await ctx.deps.generateText({
			model,
			system: ctx.deps.aiRenameHelpers.AI_RENAME_SYSTEM_PROMPT,
			temperature: 0.3,
			prompt: ctx.deps.aiRenameHelpers.buildRenamePrompt({
				currentName: entry.name,
				otherNoteNames,
				content: rawContent,
				dirPath,
			}),
		})

		const suggestedBaseName = ctx.deps.aiRenameHelpers.extractAndSanitizeName(
			aiResponse.text,
		)
		if (!suggestedBaseName) {
			throw new Error("The AI did not return a usable name.")
		}

		const { fileName: finalFileName } = await generateUniqueFileName(
			`${suggestedBaseName}.md`,
			dirPath,
			ctx.deps.fileSystemRepository.exists,
		)

		const renamedPath = await ctx.get().renameEntry(entry, finalFileName)

		const { tab } = ctx.get()

		ctx.deps.toast.success(`Renamed note to "${finalFileName}"`, {
			position: "bottom-left",
			action:
				tab?.path === renamedPath
					? undefined
					: {
							label: "Open",
							onClick: () => {
								ctx.ports.tab.openTab(renamedPath)
							},
						},
		})
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
