import { describe, expect, it } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceSelectionActions } from "./workspace-selection-actions"

describe("workspace-selection-actions", () => {
	it("resetSelection clears selected paths and anchor", () => {
		const { context, setState, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceSelectionActions(context)
		setState({
			selectedEntryPaths: new Set(["/ws/a.md"]),
			selectionAnchorPath: "/ws/a.md",
		})

		actions.resetSelection()

		expect(getState().selectedEntryPaths.size).toBe(0)
		expect(getState().selectionAnchorPath).toBeNull()
	})
})
