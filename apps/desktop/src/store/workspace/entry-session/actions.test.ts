import { describe, expect, it } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createEntrySessionActions } from "./actions"

describe("entry-session/actions", () => {
	it("resetSelection clears selected paths and anchor", () => {
		const { context, setState, getState } = createActionTestContext()
		const actions = createEntrySessionActions(context)
		setState({
			selectedEntryPaths: new Set(["/ws/a.md"]),
			selectionAnchorPath: "/ws/a.md",
		})

		actions.resetSelection()

		expect(getState().selectedEntryPaths.size).toBe(0)
		expect(getState().selectionAnchorPath).toBeNull()
	})
})
