import { describe, expect, it, vi } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceFsStructureActions } from "./workspace-fs-structure-actions"

describe("workspace-fs-structure-actions", () => {
	it("createFolder sanitizes separators and delegates entry creation", async () => {
		const { context, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entryCreated = vi.fn().mockResolvedValue(undefined)

		const createdPath = await actions.createFolder("/ws", "  a/b\\c  ")

		expect(createdPath).toBe("/ws/abc")
		expect(getState().entryCreated).toHaveBeenCalled()
	})

	it("deleteEntries uses moveManyToTrash for multiple items", async () => {
		const { context, deps, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)

		await actions.deleteEntries(["/ws/a.md", "/ws/b.md"])

		expect(deps.fileSystemRepository.moveManyToTrash).toHaveBeenCalledWith([
			"/ws/a.md",
			"/ws/b.md",
		])
		expect(getState().entriesDeleted).toHaveBeenCalledWith({
			paths: ["/ws/a.md", "/ws/b.md"],
		})
	})
})
