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

const runFrontmatterMutation = async (
	ctx: WorkspaceActionContext,
	path: string,
	mutate: () => Promise<unknown>,
) => {
	await mutate()
	registerExactLocalMutation(ctx.get().registerLocalMutation, path)
	await ctx.get().updateEntryModifiedDate(path)
}

export const createFsNoteActions = (
	ctx: WorkspaceActionContext,
): WorkspaceFsNoteActions => ({
	saveNoteContent: async (path: string, contents: string) => {
		await ctx.deps.fileSystemRepository.writeTextFile(path, contents)
		registerExactLocalMutation(ctx.get().registerLocalMutation, path)
	},

	updateFrontmatter: async (path: string, updates: Record<string, unknown>) => {
		await runFrontmatterMutation(ctx, path, () =>
			ctx.deps.frontmatterUtils.updateFileFrontmatter(path, updates),
		)
	},

	renameFrontmatterProperty: async (
		path: string,
		oldKey: string,
		newKey: string,
	) => {
		await runFrontmatterMutation(ctx, path, () =>
			ctx.deps.frontmatterUtils.renameFileFrontmatterProperty(
				path,
				oldKey,
				newKey,
			),
		)
	},

	removeFrontmatterProperty: async (path: string, key: string) => {
		await runFrontmatterMutation(ctx, path, () =>
			ctx.deps.frontmatterUtils.removeFileFrontmatterProperty(path, key),
		)
	},
})
