import { describe, expect, it, vi } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceFsTransferActions } from "./workspace-fs-transfer-actions"

describe("workspace-fs-transfer-actions", () => {
	it("moveEntry blocks moving a directory into its descendant path", async () => {
		const { context, setState, deps } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsTransferActions(context)
		setState({ workspacePath: "/ws" })

		const result = await actions.moveEntry("/ws/folder", "/ws/folder/child")

		expect(result).toBe(false)
		expect(deps.fileSystemRepository.rename).not.toHaveBeenCalled()
	})

	it("copyEntry returns false when fs copy fails", async () => {
		const { context, setState, deps, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsTransferActions(context)
		setState({ workspacePath: "/ws" })
		deps.fileSystemRepository.copy.mockRejectedValueOnce(
			new Error("copy failed"),
		)
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const result = await actions.copyEntry("/external/a.md", "/ws")

		expect(result).toBe(false)
		expect(getState().entryImported).not.toHaveBeenCalled()
		errorSpy.mockRestore()
	})

	it("moveExternalEntry returns false when rename fails", async () => {
		const { context, setState, deps, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsTransferActions(context)
		setState({ workspacePath: "/ws" })
		deps.fileSystemRepository.rename.mockRejectedValueOnce(
			new Error("rename failed"),
		)
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const result = await actions.moveExternalEntry("/external/a.md", "/ws")

		expect(result).toBe(false)
		expect(getState().entryImported).not.toHaveBeenCalled()
		errorSpy.mockRestore()
	})
})
