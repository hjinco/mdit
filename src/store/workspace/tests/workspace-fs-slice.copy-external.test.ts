import { describe, expect, it } from "vitest"
import {
	createWorkspaceFsTestStore,
	makeDir,
} from "./workspace-fs-slice-test-harness"

describe("workspace-fs-slice copy/moveExternal", () => {
	it("copyEntry rejects destinations outside the workspace", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()

		const result = await store
			.getState()
			.copyEntry("/external/note.md", "/outside/workspace")

		expect(result).toBe(false)
		expect(fileSystemRepository.copy).not.toHaveBeenCalled()
	})

	it("copyEntry copies markdown files, rewrites links, and delegates import action", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()
		fileSystemRepository.readTextFile.mockResolvedValueOnce(
			"Open [spec](./spec.md)",
		)
		fileSystemRepository.stat
			.mockResolvedValueOnce({
				isDirectory: false,
				birthtime: undefined,
				mtime: undefined,
			})
			.mockResolvedValueOnce({
				isDirectory: false,
				birthtime: 3000,
				mtime: 4000,
			})

		const result = await store.getState().copyEntry("/external/note.md", "/ws")

		expect(result).toBe(true)
		expect(fileSystemRepository.copy).toHaveBeenCalledWith(
			"/external/note.md",
			"/ws/note.md",
		)
		expect(fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
			"/ws/note.md",
			"Open [spec](../external/spec.md)",
		)
		expect(store.getState().entryImported).toHaveBeenCalledWith(
			expect.objectContaining({
				destinationDirPath: "/ws",
				expandIfDirectory: false,
				entry: expect.objectContaining({
					path: "/ws/note.md",
					name: "note.md",
					isDirectory: false,
				}),
			}),
		)
	})

	it("moveExternalEntry moves directories into workspace and delegates import action", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()
		store.setState({
			entries: [makeDir("/ws/existing", "existing")],
			expandedDirectories: ["/ws/existing"],
		})
		fileSystemRepository.stat
			.mockResolvedValueOnce({
				isDirectory: true,
				birthtime: undefined,
				mtime: undefined,
			})
			.mockResolvedValueOnce({
				isDirectory: true,
				birthtime: undefined,
				mtime: undefined,
			})
		fileSystemRepository.readDir.mockResolvedValue([])

		const result = await store
			.getState()
			.moveExternalEntry("/outside/folder", "/ws")

		expect(result).toBe(true)
		expect(fileSystemRepository.rename).toHaveBeenCalledWith(
			"/outside/folder",
			"/ws/folder",
		)

		expect(store.getState().entryImported).toHaveBeenCalledWith(
			expect.objectContaining({
				destinationDirPath: "/ws",
				expandIfDirectory: true,
				entry: expect.objectContaining({
					path: "/ws/folder",
					name: "folder",
					isDirectory: true,
				}),
			}),
		)
	})
})
