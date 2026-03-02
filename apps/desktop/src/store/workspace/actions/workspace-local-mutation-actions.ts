import type { LocalMutationTarget } from "@mdit/local-fs-origin"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"

export const createWorkspaceLocalMutationActions = (
	ctx: WorkspaceActionContext,
): Pick<WorkspaceSlice, "registerLocalMutation"> => ({
	registerLocalMutation: (
		targets: LocalMutationTarget[],
		options?: { ttlMs?: number },
	) => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath || targets.length === 0) {
			return
		}

		ctx.originJournal.register({
			workspacePath,
			targets,
			ttlMs: options?.ttlMs,
		})
	},
})
