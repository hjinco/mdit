import type { WorkspaceActionContext } from "../workspace-action-context"
import {
	closeWorkspaceTabs,
	type LoadWorkspaceOptions,
	loadWorkspace,
	resetWorkspaceState,
	syncRecentWorkspacePaths,
} from "./domain"

export type WorkspaceLifecycleActions = {
	syncRecentWorkspacePaths: () => Promise<string[]>
	loadWorkspace: (
		workspacePath: string | null,
		options?: LoadWorkspaceOptions,
	) => Promise<void>
	setWorkspace: (path: string) => Promise<void>
	removeWorkspaceFromHistory: (path: string) => Promise<void>
	openFolderPicker: () => Promise<void>
	clearWorkspace: () => Promise<void>
}

export const createLifecycleActions = (
	ctx: WorkspaceActionContext,
): WorkspaceLifecycleActions => ({
	syncRecentWorkspacePaths: async () => {
		return syncRecentWorkspacePaths(ctx)
	},

	loadWorkspace: async (workspacePath, options) => {
		await loadWorkspace(ctx, workspacePath, options)
	},

	setWorkspace: async (path: string) => {
		try {
			if (!(await ctx.deps.fileSystemRepository.isExistingDirectory(path))) {
				await ctx.deps.historyRepository.removeWorkspace(path)
				const updatedHistory =
					await ctx.deps.historyRepository.listWorkspacePaths()
				ctx.set({ recentWorkspacePaths: updatedHistory })
				ctx.deps.toast.error?.("Folder does not exist.", {
					description: path,
					position: "bottom-left",
				})
				return
			}

			closeWorkspaceTabs(ctx, { clearHistoryWhenNoActiveTab: true })

			await ctx.deps.historyRepository.touchWorkspace(path)
			const updatedHistory =
				await ctx.deps.historyRepository.listWorkspacePaths()
			await loadWorkspace(ctx, path, { recentWorkspacePaths: updatedHistory })
		} catch (error) {
			console.error("Failed to set workspace:", error)
		}
	},

	removeWorkspaceFromHistory: async (path: string) => {
		try {
			await ctx.deps.historyRepository.removeWorkspace(path)
			const updatedHistory =
				await ctx.deps.historyRepository.listWorkspacePaths()
			ctx.set({ recentWorkspacePaths: updatedHistory })
		} catch (error) {
			console.error("Failed to remove workspace from history:", error)
		}
	},

	openFolderPicker: async () => {
		const path = await ctx.deps.openDialog({
			multiple: false,
			directory: true,
			title: "Select a folder",
		})

		if (path) {
			await ctx.get().setWorkspace(path)
		}
	},

	clearWorkspace: async () => {
		const { workspacePath } = ctx.get()

		if (!workspacePath) {
			return
		}

		await ctx.deps.fileSystemRepository.moveToTrash(workspacePath)
		closeWorkspaceTabs(ctx)

		await ctx.deps.historyRepository.removeWorkspace(workspacePath)
		const updatedHistory = await ctx.deps.historyRepository.listWorkspacePaths()
		resetWorkspaceState(ctx, {
			recentWorkspacePaths: updatedHistory,
			isMigrationsComplete: true,
		})
	},
})
