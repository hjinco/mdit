import { describe, expect, it, vi } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceFsNoteActions } from "./workspace-fs-note-actions"

describe("workspace-fs-note-actions", () => {
	it("saveNoteContent records local mutation as exact path", async () => {
		const { context, getState, setState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsNoteActions(context)
		setState({ workspacePath: "/ws" })

		await actions.saveNoteContent("/ws/a.md", "content")

		expect(getState().registerLocalMutation).toHaveBeenCalledWith([
			{ path: "/ws/a.md", scope: "exact" },
		])
	})

	it("updateFrontmatter records local mutation as exact path", async () => {
		const { context, getState, setState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsNoteActions(context)
		setState({ workspacePath: "/ws" })

		await actions.updateFrontmatter("/ws/a.md", { title: "next" })

		expect(getState().registerLocalMutation).toHaveBeenCalledWith([
			{ path: "/ws/a.md", scope: "exact" },
		])
	})

	it("updateEntryModifiedDate swallows stat failures", async () => {
		const { context, deps } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsNoteActions(context)
		deps.fileSystemRepository.stat.mockRejectedValueOnce(
			new Error("stat failed"),
		)
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})

		await expect(
			actions.updateEntryModifiedDate("/ws/missing.md"),
		).resolves.toBeUndefined()
		debugSpy.mockRestore()
	})
})
