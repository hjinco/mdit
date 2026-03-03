import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"
import {
	createBatchRefreshEnqueuer,
	enqueueBatchPayloadRefresh,
} from "./batch-refresh"
import {
	cleanupWatchSession,
	deactivateCurrentWatchSession,
} from "./session-lifecycle"
import type { VaultWatchBatchPayload } from "./types"
import { VAULT_WATCH_BATCH_EVENT } from "./types"

export const createWorkspaceWatchActions = (
	ctx: WorkspaceActionContext,
): Pick<WorkspaceSlice, "watchWorkspace" | "unwatchWorkspace"> => ({
	watchWorkspace: async () => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath) {
			return
		}

		await deactivateCurrentWatchSession(ctx)
		ctx.originJournal.clearWorkspace(workspacePath)

		const appWindow = getCurrentWindow()
		const activeRef = { current: true }
		const enqueueBatchRefresh = createBatchRefreshEnqueuer(
			ctx,
			workspacePath,
			() => activeRef.current,
		)

		const unlistenPromise = appWindow.listen<VaultWatchBatchPayload>(
			VAULT_WATCH_BATCH_EVENT,
			(event) => {
				if (!activeRef.current) {
					return
				}

				const payload = event.payload
				if (!payload || payload.workspacePath !== workspacePath) {
					return
				}

				enqueueBatchPayloadRefresh(
					ctx,
					workspacePath,
					payload,
					enqueueBatchRefresh,
				)
			},
		)

		try {
			await invoke("start_vault_watch_command", { workspacePath })
		} catch (error) {
			await cleanupWatchSession(activeRef, unlistenPromise, {
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
			ctx.originJournal.clearWorkspace(workspacePath)
		}
		void deactivateCurrentWatchSession(ctx)
	},
})
