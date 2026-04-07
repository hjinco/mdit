import type { WorkspaceActionContext } from "../workspace-action-context"
import {
	closeWorkspaceTabs,
	hasUnsavedWorkspaceTabs,
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
): WorkspaceLifecycleActions => {
	const listRecentWorkspacePaths = () =>
		ctx.deps.historyRepository.listWorkspacePaths()

	const updateRecentWorkspacePaths = async () => {
		const recentWorkspacePaths = await listRecentWorkspacePaths()
		ctx.set({ recentWorkspacePaths })
		return recentWorkspacePaths
	}

	return {
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
					await updateRecentWorkspacePaths()
					ctx.deps.toast.error?.("Folder does not exist.", {
						description: path,
						position: "bottom-left",
					})
					return
				}

				if (hasUnsavedWorkspaceTabs(ctx)) {
					ctx.deps.toast.error?.("Save open notes before switching workspaces.")
					return
				}

				await closeWorkspaceTabs(ctx, {
					clearHistoryWhenNoActiveTab: true,
				})
				await ctx.deps.historyRepository.touchWorkspace(path)
				const recentWorkspacePaths = await listRecentWorkspacePaths()
				await loadWorkspace(ctx, path, { recentWorkspacePaths })
			} catch (error) {
				console.error("Failed to set workspace:", error)
			}
		},

		removeWorkspaceFromHistory: async (path: string) => {
			try {
				await ctx.deps.historyRepository.removeWorkspace(path)
				await updateRecentWorkspacePaths()
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

			try {
				if (hasUnsavedWorkspaceTabs(ctx)) {
					ctx.deps.toast.error?.(
						"Save open notes before clearing the workspace.",
					)
					return
				}

				await ctx.deps.fileSystemRepository.moveToTrash(workspacePath)
				await closeWorkspaceTabs(ctx)
				await ctx.deps.historyRepository.removeWorkspace(workspacePath)
				const recentWorkspacePaths = await listRecentWorkspacePaths()
				resetWorkspaceState(ctx, {
					recentWorkspacePaths,
					isMigrationsComplete: true,
				})
			} catch (error) {
				console.error("Failed to clear workspace:", error)
			}
		},
	}
}
