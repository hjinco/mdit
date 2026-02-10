import { describe, expect, it } from "vitest"
import {
	createWorkspaceFsTestStore,
	makeDir,
	makeFile,
} from "./workspace-fs-slice-test-harness"

describe("workspace-fs-slice rename/move", () => {
	it("renameEntry returns original path when destination already exists", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()
		const entry = makeFile("/ws/a.md", "a.md")
		store.setState({ entries: [entry] })
		fileSystemRepository.exists.mockImplementation(async (path: string) => {
			return path === "/ws/b.md"
		})

		const result = await store.getState().renameEntry(entry, "b.md")

		expect(result).toBe("/ws/a.md")
		expect(fileSystemRepository.rename).not.toHaveBeenCalled()
	})

	it("renameEntry renames directories and delegates workspace updates", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()
		const entry = makeDir("/ws/folder", "folder", [
			makeFile("/ws/folder/note.md", "note.md"),
		])
		store.setState({
			entries: [entry],
			pinnedDirectories: ["/ws/folder", "/ws/other"],
			expandedDirectories: ["/ws/folder", "/ws/folder/child"],
		})
		fileSystemRepository.exists.mockResolvedValue(false)

		const result = await store.getState().renameEntry(entry, "renamed")

		expect(result).toBe("/ws/renamed")
		expect(fileSystemRepository.rename).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
		)
		expect(store.getState().renameTab).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
		)
		expect(store.getState().updateHistoryPath).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
		)
		expect(store.getState().entryRenamed).toHaveBeenCalledWith({
			oldPath: "/ws/folder",
			newPath: "/ws/renamed",
			isDirectory: true,
			newName: "renamed",
		})
	})

	it("moveEntry blocks moving a directory into its descendant path", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()

		const result = await store
			.getState()
			.moveEntry("/ws/folder", "/ws/folder/child")

		expect(result).toBe(false)
		expect(fileSystemRepository.rename).not.toHaveBeenCalled()
	})

	it("moveEntry moves markdown files, rewrites links, and refreshes active tab content", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()
		store.setState({
			entries: [
				makeDir("/ws/a", "a", [makeFile("/ws/a/note.md", "note.md")]),
				makeDir("/ws/b", "b", []),
			],
			tab: { path: "/ws/a/note.md" },
			isSaved: true,
		})
		fileSystemRepository.readTextFile.mockResolvedValueOnce(
			"Link [asset](./asset.png)",
		)

		const result = await store.getState().moveEntry("/ws/a/note.md", "/ws/b")

		expect(result).toBe(true)
		expect(fileSystemRepository.rename).toHaveBeenCalledWith(
			"/ws/a/note.md",
			"/ws/b/note.md",
		)
		expect(fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
			"/ws/b/note.md",
			"Link [asset](../a/asset.png)",
		)
		expect(store.getState().renameTab).toHaveBeenCalledWith(
			"/ws/a/note.md",
			"/ws/b/note.md",
			{ refreshContent: true },
		)
		expect(store.getState().updateHistoryPath).toHaveBeenCalledWith(
			"/ws/a/note.md",
			"/ws/b/note.md",
		)
		expect(store.getState().entryMoved).toHaveBeenCalledWith({
			sourcePath: "/ws/a/note.md",
			destinationDirPath: "/ws/b",
			newPath: "/ws/b/note.md",
			isDirectory: false,
		})
	})

	it("moveEntry returns false when source entry is missing in state", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()
		store.setState({ entries: [makeDir("/ws/dir", "dir")] })

		const result = await store.getState().moveEntry("/ws/missing.md", "/ws/dir")

		expect(result).toBe(false)
		expect(fileSystemRepository.rename).not.toHaveBeenCalled()
	})
})
