import { describe, expect, it, vi } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceLifecycleActions } from "./workspace-lifecycle-actions"

describe("workspace-lifecycle-actions", () => {
	it("openFolderPicker delegates selected path to setWorkspace", async () => {
		const { context, deps, getState } = createWorkspaceActionTestContext()
		deps.openDialog.mockResolvedValue("/ws")
		getState().setWorkspace = vi.fn().mockResolvedValue(undefined)
		const actions = createWorkspaceLifecycleActions(context)

		await actions.openFolderPicker()

		expect(deps.openDialog).toHaveBeenCalledTimes(1)
		expect(getState().setWorkspace).toHaveBeenCalledWith("/ws")
	})
})
