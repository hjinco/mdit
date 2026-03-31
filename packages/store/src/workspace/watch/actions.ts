import type { WorkspaceActionContext } from "../workspace-action-context"
import {
	createBatchRefreshEnqueuer,
	enqueueBatchPayloadRefresh,
} from "./batch-refresh"
import {
	cleanupWatchSession,
	deactivateCurrentWatchSession,
} from "./session-lifecycle"

export type WorkspaceWatchActions = {
	watchWorkspace: () => Promise<void>
	unwatchWorkspace: () => void
}

export const createWatchActions = (
	ctx: WorkspaceActionContext,
): WorkspaceWatchActions => ({
	watchWorkspace: async () => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath) {
			return
		}

		await deactivateCurrentWatchSession(ctx)
		ctx.runtime.originJournal.clearWorkspace(workspacePath)

		const activeRef = { current: true }
		const enqueueBatchRefresh = createBatchRefreshEnqueuer(
			ctx,
			workspacePath,
			() => activeRef.current,
		)

		const unlistenPromise = ctx.deps.watcher.subscribe((payload) => {
			if (!activeRef.current) {
				return
			}

			if (!payload || payload.workspacePath !== workspacePath) {
				return
			}

			enqueueBatchPayloadRefresh(
				ctx,
				workspacePath,
				payload,
				enqueueBatchRefresh,
			)
		})

		try {
			await ctx.deps.watcher.start(workspacePath)
		} catch (error) {
			await cleanupWatchSession(activeRef, unlistenPromise, {
				ctx,
				workspacePath,
				stopWatcher: false,
				stopWarningMessage: "Failed to stop vault watcher:",
				unlistenWarningMessage: "Failed to remove vault watch event listener:",
			})
			console.error("Failed to start vault watch command:", error)
			return
		}

		if (ctx.get().workspacePath !== workspacePath) {
			await cleanupWatchSession(activeRef, unlistenPromise, {
				ctx,
				workspacePath,
				stopWatcher: true,
				stopWarningMessage: "Failed to stop stale vault watcher:",
				unlistenWarningMessage: "Failed to remove stale vault watch listener:",
			})
			return
		}

		ctx.set({
			unwatchFn: () => {
				return cleanupWatchSession(activeRef, unlistenPromise, {
					ctx,
					workspacePath,
					stopWatcher: true,
					stopWarningMessage: "Failed to stop vault watcher:",
					unlistenWarningMessage:
						"Failed to remove vault watch event listener:",
				})
			},
		})
	},

	unwatchWorkspace: () => {
		const workspacePath = ctx.get().workspacePath
		if (workspacePath) {
			ctx.runtime.originJournal.clearWorkspace(workspacePath)
		}
		void deactivateCurrentWatchSession(ctx)
	},
})
