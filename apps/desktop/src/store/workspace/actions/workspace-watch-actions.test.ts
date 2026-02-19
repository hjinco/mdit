import { describe, expect, it, vi } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceWatchActions } from "./workspace-watch-actions"

describe("workspace-watch-actions", () => {
	it("unwatchWorkspace runs unwatch function and clears state", () => {
		const { context, setState, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceWatchActions(context)
		const unwatch = vi.fn()
		setState({ unwatchFn: unwatch })

		actions.unwatchWorkspace()

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(getState().unwatchFn).toBeNull()
	})
})
