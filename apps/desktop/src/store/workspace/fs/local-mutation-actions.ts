import type { LocalMutationTarget } from "@mdit/local-fs-origin"
import type { WorkspaceActionContext } from "../workspace-action-context"

export type WorkspaceFsLocalMutationActions = {
	registerLocalMutation: (
		targets: LocalMutationTarget[],
		options?: { ttlMs?: number },
	) => void
}

export const createFsLocalMutationActions = (
	ctx: WorkspaceActionContext,
): WorkspaceFsLocalMutationActions => ({
	registerLocalMutation: (
		targets: LocalMutationTarget[],
		options?: { ttlMs?: number },
	) => {
		const workspacePath = ctx.get().workspacePath
		if (!workspacePath || targets.length === 0) {
			return
		}

		ctx.runtime.originJournal.register({
			workspacePath,
			targets,
			ttlMs: options?.ttlMs,
		})
	},
})
