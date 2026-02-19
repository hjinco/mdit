import { watch } from "@tauri-apps/plugin-fs"
import { hasHiddenEntryInPaths } from "@/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"

export const createWorkspaceWatchActions = (
	ctx: WorkspaceActionContext,
): Pick<WorkspaceSlice, "watchWorkspace" | "unwatchWorkspace"> => ({
	watchWorkspace: async () => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath) {
			return
		}

		const currentUnwatch = ctx.get().unwatchFn
		if (currentUnwatch) {
			currentUnwatch()
		}

		const unwatch = await watch(
			workspacePath,
			(event) => {
				if (hasHiddenEntryInPaths(event.paths)) {
					return
				}

				const lastFsOpTime = ctx.get().lastFsOperationTime
				if (lastFsOpTime !== null && Date.now() - lastFsOpTime < 5000) {
					return
				}

				ctx.get().refreshWorkspaceEntries()
			},
			{
				recursive: true,
				delayMs: 1500,
			},
		)

		if (ctx.get().workspacePath !== workspacePath) {
			unwatch()
			return
		}

		ctx.set({ unwatchFn: unwatch })
	},

	unwatchWorkspace: () => {
		const unwatchFn = ctx.get().unwatchFn
		if (unwatchFn) {
			unwatchFn()
			ctx.set({ unwatchFn: null })
		}
	},
})
