import { describe, expect, it, vi } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceFsNoteActions } from "./workspace-fs-note-actions"

describe("workspace-fs-note-actions", () => {
	it("recordFsOperation updates timestamp", () => {
		const { context, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsNoteActions(context)
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(1234)

		actions.recordFsOperation()

		expect(getState().lastFsOperationTime).toBe(1234)
		dateNowSpy.mockRestore()
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
