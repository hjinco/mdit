import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"
import { findEntryByPath } from "./domain/entry-tree"
import { readWorkspaceEntriesFromPath } from "./entry-snapshot-fs"

export type WorkspaceTreeActions = {
	getEntryByPath: (path: string) => WorkspaceEntry | null
	readWorkspaceEntriesFromPath: (path: string) => Promise<WorkspaceEntry[]>
	setIsEditMode: (isEditMode: boolean) => void
	updateEntries: (
		entriesOrAction:
			| WorkspaceEntry[]
			| ((entries: WorkspaceEntry[]) => WorkspaceEntry[]),
	) => void
	refreshWorkspaceEntries: () => Promise<void>
}

export const createTreeActions = (
	ctx: WorkspaceActionContext,
): WorkspaceTreeActions => ({
	getEntryByPath: (path: string) => findEntryByPath(ctx.get().entries, path),

	readWorkspaceEntriesFromPath: (path: string) =>
		readWorkspaceEntriesFromPath(path, ctx.deps.fileSystemRepository),

	setIsEditMode: (isEditMode: boolean) => {
		ctx.set({ isEditMode })
	},

	updateEntries: (entriesOrAction) => {
		const entries =
			typeof entriesOrAction === "function"
				? entriesOrAction(ctx.get().entries)
				: entriesOrAction
		ctx.set({ entries })
		ctx.ports.collection.refreshCollectionEntries()
	},

	refreshWorkspaceEntries: async () => {
		const workspacePath = ctx.get().workspacePath

		if (!workspacePath) throw new Error("Workspace path is not set")

		ctx.set({ isTreeLoading: true })

		try {
			const entries = await ctx
				.get()
				.readWorkspaceEntriesFromPath(workspacePath)

			if (ctx.get().workspacePath !== workspacePath) {
				return
			}

			await ctx.get().syncDirectoryUiStateWithEntries({
				workspacePath,
				nextEntries: entries,
				options: {
					persistExpandedWhenUnchanged: true,
				},
			})
		} finally {
			ctx.set({ isTreeLoading: false })
		}
	},
})
