import { describe, expect, it } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createFsLocalMutationActions } from "./local-mutation-actions"

describe("fs-local-mutation-actions", () => {
	it("registerLocalMutation registers targets when workspace is active", () => {
		const { context, originJournal, setState } = createActionTestContext()
		const actions = createFsLocalMutationActions(context)
		setState({ workspacePath: "/ws" })

		actions.registerLocalMutation([{ path: "/ws/a.md", scope: "exact" }])

		expect(originJournal.register).toHaveBeenCalledWith({
			workspacePath: "/ws",
			targets: [{ path: "/ws/a.md", scope: "exact" }],
			ttlMs: undefined,
		})
	})
})
