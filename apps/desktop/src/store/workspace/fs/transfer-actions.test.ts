import { describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createFsTransferActions } from "./transfer-actions"

describe("fs-transfer-actions", () => {
	it("moveEntry blocks moving a directory into its descendant path", async () => {
		const { context, setState, deps } = createActionTestContext()
		const actions = createFsTransferActions(context)
		setState({ workspacePath: "/ws" })

		const result = await actions.moveEntry("/ws/folder", "/ws/folder/child")

		expect(result).toBe(false)
		expect(deps.fileSystemRepository.rename).not.toHaveBeenCalled()
	})

	it("moveEntry blocks moving a locked source path", async () => {
		const { context, setState, deps } = createActionTestContext()
		const actions = createFsTransferActions(context)
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
		const { context, setState, deps } = createActionTestContext()
		const actions = createFsTransferActions(context)
		setState({
			workspacePath: "/ws",
			aiLockedEntryPaths: new Set(["/ws/source/a.md"]),
		})

		const result = await actions.moveEntry("/ws/source", "/ws/dest")

		expect(result).toBe(false)
		expect(deps.fileSystemRepository.rename).not.toHaveBeenCalled()
	})

	it("copyEntry returns null when file copy fails", async () => {
		const { context, setState, deps, getState } = createActionTestContext()
		const actions = createFsTransferActions(context)
		setState({ workspacePath: "/ws" })
		deps.fileSystemRepository.copy.mockRejectedValueOnce(
			new Error("copy failed"),
		)
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const result = await actions.copyEntry("/external/a.md", "/ws")

		expect(result).toBeNull()
		expect(getState().entryImported).not.toHaveBeenCalled()
		errorSpy.mockRestore()
	})

	it("copyEntry returns null when destination is outside workspace", async () => {
		const { context, deps, setState } = createActionTestContext()
		const actions = createFsTransferActions(context)
		setState({ workspacePath: "/ws" })

		const result = await actions.copyEntry("/ws/source/a.md", "/external")

		expect(result).toBeNull()
		expect(deps.fileSystemRepository.copy).not.toHaveBeenCalled()
	})

	it("moveExternalEntry returns false when rename fails", async () => {
		const { context, setState, deps, getState } = createActionTestContext()
		const actions = createFsTransferActions(context)
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

	it("copyEntry returns the copied path", async () => {
		const { context, setState, deps, getState } = createActionTestContext()
		const actions = createFsTransferActions(context)
		setState({ workspacePath: "/ws" })

		const result = await actions.copyEntry("/external/a.png", "/ws")

		expect(result).toBe("/ws/a.png")
		expect(deps.fileSystemRepository.copy).toHaveBeenCalledWith(
			"/external/a.png",
			"/ws/a.png",
		)
		expect(getState().entryImported).toHaveBeenCalledWith({
			destinationDirPath: "/ws",
			entry: {
				path: "/ws/a.png",
				name: "a.png",
				isDirectory: false,
				children: undefined,
				createdAt: undefined,
				modifiedAt: undefined,
			},
			expandIfDirectory: false,
		})
	})

	it("copyEntry auto-renames when destination file already exists", async () => {
		const { context, setState, deps } = createActionTestContext()
		const actions = createFsTransferActions(context)
		setState({ workspacePath: "/ws" })
		deps.fileSystemRepository.exists.mockImplementation(
			async (path: string) => path === "/ws/a.png",
		)

		const result = await actions.copyEntry("/external/a.png", "/ws")

		expect(result).toBe("/ws/a (1).png")
		expect(deps.fileSystemRepository.copy).toHaveBeenCalledWith(
			"/external/a.png",
			"/ws/a (1).png",
		)
	})

	it("copyEntry returns null when fs copy fails", async () => {
		const { context, setState, deps, getState } = createActionTestContext()
		const actions = createFsTransferActions(context)
		setState({ workspacePath: "/ws" })
		deps.fileSystemRepository.copy.mockRejectedValueOnce(
			new Error("copy failed"),
		)
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const result = await actions.copyEntry("/external/a.png", "/ws")

		expect(result).toBeNull()
		expect(getState().entryImported).not.toHaveBeenCalled()
		errorSpy.mockRestore()
	})

	it("moveEntry keeps success result when onMoved callback throws", async () => {
		const { context, setState, deps, getState } = createActionTestContext()
		const actions = createFsTransferActions(context)
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
		const { context, setState, deps, getState } = createActionTestContext()
		const actions = createFsTransferActions(context)
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

	it("moveEntry does not rewrite markdown file content after move", async () => {
		const { context, setState, deps, getState } = createActionTestContext()
		const actions = createFsTransferActions(context)

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

		const result = await actions.moveEntry("/ws/source/a.md", "/ws/dest")

		expect(result).toBe(true)
		expect(getState().entryMoved).toHaveBeenCalledWith({
			sourcePath: "/ws/source/a.md",
			destinationDirPath: "/ws/dest",
			newPath: "/ws/dest/a.md",
			isDirectory: false,
			refreshContent: false,
		})
		expect(deps.fileSystemRepository.readTextFile).not.toHaveBeenCalled()
		expect(deps.fileSystemRepository.writeTextFile).not.toHaveBeenCalled()
	})

	it("copyEntry does not rewrite markdown file content after copy", async () => {
		const { context, setState, deps, getState } = createActionTestContext()
		const actions = createFsTransferActions(context)
		setState({ workspacePath: "/ws" })
		deps.fileSystemRepository.stat.mockResolvedValueOnce({
			isDirectory: false,
			birthtime: undefined,
			mtime: undefined,
		})

		const result = await actions.copyEntry("/ws/source/a.md", "/ws/dest")

		expect(result).toBe("/ws/dest/a.md")
		expect(getState().entryImported).toHaveBeenCalledWith({
			destinationDirPath: "/ws/dest",
			entry: {
				path: "/ws/dest/a.md",
				name: "a.md",
				isDirectory: false,
				children: undefined,
				createdAt: undefined,
				modifiedAt: undefined,
			},
			expandIfDirectory: false,
		})
		expect(deps.fileSystemRepository.readTextFile).not.toHaveBeenCalled()
		expect(deps.fileSystemRepository.writeTextFile).not.toHaveBeenCalled()
	})

	it("copyEntry imports directory entry with metadata and children", async () => {
		const { context, setState, deps, getState } = createActionTestContext()
		const actions = createFsTransferActions(context)

		setState({
			workspacePath: "/ws",
			readWorkspaceEntriesFromPath: async () => [
				{ path: "/ws/dest/dir/a.md", name: "a.md", isDirectory: false },
			],
		})

		deps.fileSystemRepository.stat.mockImplementation(async (path: string) => {
			if (path === "/external/dir") {
				return {
					isDirectory: true,
					birthtime: undefined,
					mtime: undefined,
				}
			}

			if (path === "/ws/dest/dir") {
				return {
					isDirectory: true,
					birthtime: "2024-01-01T00:00:00.000Z",
					mtime: "2024-01-02T00:00:00.000Z",
				}
			}

			return {
				isDirectory: false,
				birthtime: undefined,
				mtime: undefined,
			}
		})

		const result = await actions.copyEntry("/external/dir", "/ws/dest")

		expect(result).toBe("/ws/dest/dir")
		expect(getState().entryImported).toHaveBeenCalledWith({
			destinationDirPath: "/ws/dest",
			entry: {
				path: "/ws/dest/dir",
				name: "dir",
				isDirectory: true,
				children: [
					{ path: "/ws/dest/dir/a.md", name: "a.md", isDirectory: false },
				],
				createdAt: new Date("2024-01-01T00:00:00.000Z"),
				modifiedAt: new Date("2024-01-02T00:00:00.000Z"),
			},
			expandIfDirectory: true,
		})
	})
})
