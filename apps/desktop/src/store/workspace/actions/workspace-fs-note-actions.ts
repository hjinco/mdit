import { updateEntryMetadata } from "../helpers/entry-helpers"
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
