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

	it("createNote sanitizes initialName separators before file creation", async () => {
		const { context, deps, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entryCreated = vi.fn().mockResolvedValue(undefined)

		const createdPath = await actions.createNote("/ws", {
			initialName: "../../etc/passwd",
		})

		expect(createdPath).toBe("/ws/....etcpasswd.md")
		expect(deps.fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
			"/ws/....etcpasswd.md",
			"",
		)

		const createdEntryName =
			getState().entryCreated.mock.calls[0]?.[0]?.entry?.name
		expect(createdEntryName).toBe("....etcpasswd.md")
		expect(createdEntryName).not.toMatch(/[\\/]/)
	})

	it("createNote throws when sanitized initialName is empty", async () => {
		const { context, deps } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)

		await expect(
			actions.createNote("/ws", { initialName: " / \\\\ " }),
		).rejects.toThrow("Note name is empty after sanitization.")

		expect(deps.fileSystemRepository.writeTextFile).not.toHaveBeenCalled()
	})

	it("renameEntry sanitizes separators from newName", async () => {
		const { context, deps, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)

		const renamedPath = await actions.renameEntry(
			{
				path: "/ws/old.md",
				name: "old.md",
				isDirectory: false,
			},
			"a/b\\c",
		)

		expect(renamedPath).toBe("/ws/abc")
		expect(deps.fileSystemRepository.rename).toHaveBeenCalledWith(
			"/ws/old.md",
			"/ws/abc",
		)
		expect(getState().entryRenamed).toHaveBeenCalledWith(
			expect.objectContaining({
				newPath: "/ws/abc",
				newName: "abc",
			}),
		)
	})

	it("renameEntry updates tab path in edit mode without entryRenamed", async () => {
		const { context, deps, ports, setState, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ isEditMode: true })

		const renamedPath = await actions.renameEntry(
			{
				path: "/ws/old.md",
				name: "old.md",
				isDirectory: false,
			},
			"new.md",
		)

		expect(renamedPath).toBe("/ws/new.md")
		expect(deps.fileSystemRepository.rename).toHaveBeenCalledWith(
			"/ws/old.md",
			"/ws/new.md",
		)
		expect(ports.tab.renameTab).toHaveBeenCalledWith("/ws/old.md", "/ws/new.md")
		expect(getState().entryRenamed).not.toHaveBeenCalled()
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
