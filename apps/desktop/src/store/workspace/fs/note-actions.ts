import type { WorkspaceActionContext } from "../workspace-action-context"
import { registerExactLocalMutation } from "./local-mutation-helpers"

export type WorkspaceFsNoteActions = {
	saveNoteContent: (path: string, contents: string) => Promise<void>
	updateFrontmatter: (
		path: string,
		updates: Record<string, unknown>,
	) => Promise<void>
	renameFrontmatterProperty: (
		path: string,
		oldKey: string,
		newKey: string,
	) => Promise<void>
	removeFrontmatterProperty: (path: string, key: string) => Promise<void>
}

export const createFsNoteActions = (
	ctx: WorkspaceActionContext,
): WorkspaceFsNoteActions => ({
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
})
