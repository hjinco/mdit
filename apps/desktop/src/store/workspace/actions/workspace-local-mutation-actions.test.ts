import { describe, expect, it } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceLocalMutationActions } from "./workspace-local-mutation-actions"

describe("workspace-local-mutation-actions", () => {
	it("registerLocalMutation registers targets when workspace is active", () => {
		const { context, originJournal, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceLocalMutationActions(context)
		setState({ workspacePath: "/ws" })

		actions.registerLocalMutation([{ path: "/ws/a.md", scope: "exact" }])

		expect(originJournal.register).toHaveBeenCalledWith({
			workspacePath: "/ws",
			targets: [{ path: "/ws/a.md", scope: "exact" }],
			ttlMs: undefined,
		})
	})
})
