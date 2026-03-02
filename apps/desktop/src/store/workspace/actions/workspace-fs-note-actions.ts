import { updateEntryMetadata } from "../helpers/entry-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"
import { registerExactLocalMutation } from "./workspace-local-mutation-helpers"

export const createWorkspaceFsNoteActions = (
	ctx: WorkspaceActionContext,
): Pick<
	WorkspaceSlice,
	| "saveNoteContent"
	| "updateFrontmatter"
	| "renameFrontmatterProperty"
	| "removeFrontmatterProperty"
	| "updateEntryModifiedDate"
> => ({
	saveNoteContent: async (path: string, contents: string) => {
		await ctx.deps.fileSystemRepository.writeTextFile(path, contents)
		registerExactLocalMutation(ctx.get().registerLocalMutation, path)
	},

	updateFrontmatter: async (path: string, updates: Record<string, unknown>) => {
		await ctx.deps.frontmatterUtils.updateFileFrontmatter(path, updates)
		registerExactLocalMutation(ctx.get().registerLocalMutation, path)
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
		registerExactLocalMutation(ctx.get().registerLocalMutation, path)
		await ctx.get().updateEntryModifiedDate(path)
	},

	removeFrontmatterProperty: async (path: string, key: string) => {
		await ctx.deps.frontmatterUtils.removeFileFrontmatterProperty(path, key)
		registerExactLocalMutation(ctx.get().registerLocalMutation, path)
		await ctx.get().updateEntryModifiedDate(path)
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
