import { describe, expect, it } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createFsNoteActions } from "./note-actions"

describe("fs-note-actions", () => {
	it("saveNoteContent records local mutation as exact path", async () => {
		const { context, getState, setState } = createActionTestContext()
		const actions = createFsNoteActions(context)
		setState({ workspacePath: "/ws" })

		await actions.saveNoteContent("/ws/a.md", "content")

		expect(getState().registerLocalMutation).toHaveBeenCalledWith([
			{ path: "/ws/a.md", scope: "exact" },
		])
	})

	it("updateFrontmatter records local mutation as exact path", async () => {
		const { context, getState, setState } = createActionTestContext()
		const actions = createFsNoteActions(context)
		setState({ workspacePath: "/ws" })

		await actions.updateFrontmatter("/ws/a.md", { title: "next" })

		expect(getState().registerLocalMutation).toHaveBeenCalledWith([
			{ path: "/ws/a.md", scope: "exact" },
		])
		expect(getState().updateEntryModifiedDate).toHaveBeenCalledWith("/ws/a.md")
	})

	it("renameFrontmatterProperty updates entry metadata", async () => {
		const { context, getState } = createActionTestContext()
		const actions = createFsNoteActions(context)

		await actions.renameFrontmatterProperty("/ws/a.md", "old", "new")

		expect(getState().updateEntryModifiedDate).toHaveBeenCalledWith("/ws/a.md")
	})

	it("removeFrontmatterProperty updates entry metadata", async () => {
		const { context, getState } = createActionTestContext()
		const actions = createFsNoteActions(context)

		await actions.removeFrontmatterProperty("/ws/a.md", "title")

		expect(getState().updateEntryModifiedDate).toHaveBeenCalledWith("/ws/a.md")
	})
})
