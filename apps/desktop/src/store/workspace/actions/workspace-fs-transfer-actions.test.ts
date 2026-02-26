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

	it("moveEntry blocks moving a locked source path", async () => {
		const { context, setState, deps } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsTransferActions(context)
		const onMoved = vi.fn()
		setState({
			workspacePath: "/ws",
			aiLockedEntryPaths: new Set(["/ws/source/a.md"]),
		})

		const result = await actions.moveEntry("/ws/source/a.md", "/ws/dest", {
			onMoved,
		})

		expect(result).toBe(false)
		expect(deps.fileSystemRepository.rename).not.toHaveBeenCalled()
		expect(onMoved).not.toHaveBeenCalled()
	})

	it("moveEntry blocks moving a directory that contains a locked descendant", async () => {
		const { context, setState, deps } = createWorkspaceActionTestContext()
		const actions = createWorkspaceFsTransferActions(context)
		setState({
			workspacePath: "/ws",
			aiLockedEntryPaths: new Set(["/ws/source/a.md"]),
		})

		const result = await actions.moveEntry("/ws/source", "/ws/dest")

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

	it("moveEntry keeps success result when onMoved callback throws", async () => {
		const { context, setState, deps, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsTransferActions(context)
		const onMoved = vi.fn(() => {
			throw new Error("callback failed")
		})
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/source",
					name: "source",
					isDirectory: true,
					children: [
						{
							path: "/ws/source/a.txt",
							name: "a.txt",
							isDirectory: false,
						},
					],
				},
				{
					path: "/ws/dest",
					name: "dest",
					isDirectory: true,
					children: [],
				},
			],
		})

		const result = await actions.moveEntry("/ws/source/a.txt", "/ws/dest", {
			onMoved,
		})

		expect(result).toBe(true)
		expect(deps.fileSystemRepository.rename).toHaveBeenCalledWith(
			"/ws/source/a.txt",
			"/ws/dest/a.txt",
		)
		expect(getState().entryMoved).toHaveBeenCalledWith({
			sourcePath: "/ws/source/a.txt",
			destinationDirPath: "/ws/dest",
			newPath: "/ws/dest/a.txt",
			isDirectory: false,
			refreshContent: false,
		})
		expect(onMoved).toHaveBeenCalledWith("/ws/dest/a.txt")
		expect(errorSpy).toHaveBeenCalled()
		errorSpy.mockRestore()
	})

	it("moveEntry auto-renames when destination file already exists", async () => {
		const { context, setState, deps, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsTransferActions(context)
		const onMoved = vi.fn()
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/source",
					name: "source",
					isDirectory: true,
					children: [
						{
							path: "/ws/source/a.md",
							name: "a.md",
							isDirectory: false,
						},
					],
				},
				{
					path: "/ws/dest",
					name: "dest",
					isDirectory: true,
					children: [],
				},
			],
		})
		deps.fileSystemRepository.exists.mockImplementation(
			async (path: string) => {
				return path === "/ws/dest/a.md"
			},
		)
		deps.fileSystemRepository.readTextFile.mockResolvedValueOnce("# moved")

		const result = await actions.moveEntry("/ws/source/a.md", "/ws/dest", {
			onConflict: "auto-rename",
			onMoved,
		})

		expect(result).toBe(true)
		expect(deps.fileSystemRepository.rename).toHaveBeenCalledWith(
			"/ws/source/a.md",
			"/ws/dest/a (1).md",
		)
		expect(getState().entryMoved).toHaveBeenCalledWith({
			sourcePath: "/ws/source/a.md",
			destinationDirPath: "/ws/dest",
			newPath: "/ws/dest/a (1).md",
			isDirectory: false,
			refreshContent: false,
		})
		expect(onMoved).toHaveBeenCalledWith("/ws/dest/a (1).md")
	})
})
