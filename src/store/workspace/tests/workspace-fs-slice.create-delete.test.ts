import { describe, expect, it, vi } from "vitest"
import {
	createWorkspaceFsTestStore,
	makeFile,
} from "./workspace-fs-slice-test-harness"

describe("workspace-fs-slice create/delete", () => {
	it("createFolder sanitizes path separators and delegates tree update", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()

		const createdPath = await store
			.getState()
			.createFolder("/ws", "  new/folder\\name  ")

		expect(createdPath).toBe("/ws/newfoldername")
		expect(fileSystemRepository.mkdir).toHaveBeenCalledWith(
			"/ws/newfoldername",
			{
				recursive: true,
			},
		)

		const state = store.getState()
		expect(state.entryCreated).toHaveBeenCalledWith({
			parentPath: "/ws",
			entry: {
				path: "/ws/newfoldername",
				name: "newfoldername",
				isDirectory: true,
				children: [],
				createdAt: undefined,
				modifiedAt: undefined,
			},
			expandParent: true,
			expandNewDirectory: true,
		})
		expect(state.setSelectedEntryPaths).toHaveBeenCalledWith(
			new Set(["/ws/newfoldername"]),
		)
		expect(state.setSelectionAnchorPath).toHaveBeenCalledWith(
			"/ws/newfoldername",
		)
	})

	it("createNote writes file, delegates entry creation, and opens tab when requested", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()

		const createdPath = await store.getState().createNote("/ws", {
			initialName: "Daily",
			initialContent: "# hello",
			openTab: true,
		})

		expect(createdPath).toBe("/ws/Daily.md")
		expect(fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
			"/ws/Daily.md",
			"# hello",
		)

		const state = store.getState()
		expect(state.entryCreated).toHaveBeenCalledTimes(1)
		expect(state.entryCreated).toHaveBeenCalledWith(
			expect.objectContaining({
				parentPath: "/ws",
				entry: expect.objectContaining({
					path: "/ws/Daily.md",
					name: "Daily.md",
					isDirectory: false,
				}),
			}),
		)
		expect(state.openTab).toHaveBeenCalledWith("/ws/Daily.md")
		expect(state.setSelectedEntryPaths).toHaveBeenCalledWith(
			new Set(["/ws/Daily.md"]),
		)
		expect(state.setSelectionAnchorPath).toHaveBeenCalledWith("/ws/Daily.md")
	})

	it("deleteEntries trashes target paths and delegates tree deletion", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()

		store.setState({
			tab: { path: "/ws/delete.md" },
			isSaved: true,
			entries: [
				makeFile("/ws/delete.md", "delete.md"),
				makeFile("/ws/keep.md", "keep.md"),
			],
		})

		await store.getState().deleteEntries(["/ws/delete.md"])

		expect(fileSystemRepository.moveToTrash).toHaveBeenCalledWith(
			"/ws/delete.md",
		)
		expect(fileSystemRepository.moveManyToTrash).not.toHaveBeenCalled()

		const state = store.getState()
		expect(state.closeTab).toHaveBeenCalledWith("/ws/delete.md")
		expect(state.removePathFromHistory).toHaveBeenCalledWith("/ws/delete.md")
		expect(state.entriesDeleted).toHaveBeenCalledWith({
			paths: ["/ws/delete.md"],
		})
		expect(state.lastFsOperationTime).toBeTypeOf("number")
	})

	it("deleteEntries uses moveManyToTrash for multiple paths", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()
		store.setState({
			entries: [
				makeFile("/ws/a.md", "a.md"),
				makeFile("/ws/b.md", "b.md"),
				makeFile("/ws/c.md", "c.md"),
			],
			expandedDirectories: ["/ws", "/ws/a.md", "/ws/b.md", "/ws/c.md"],
		})

		await store.getState().deleteEntries(["/ws/a.md", "/ws/b.md"])

		expect(fileSystemRepository.moveManyToTrash).toHaveBeenCalledWith([
			"/ws/a.md",
			"/ws/b.md",
		])
		expect(fileSystemRepository.moveToTrash).not.toHaveBeenCalled()
		expect(store.getState().entriesDeleted).toHaveBeenCalledWith({
			paths: ["/ws/a.md", "/ws/b.md"],
		})
		expect(store.getState().removePathFromHistory).toHaveBeenCalledTimes(2)
	})

	it("updateEntryModifiedDate swallows stat failures", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()
		fileSystemRepository.stat.mockRejectedValueOnce(new Error("stat failed"))
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})

		await expect(
			store.getState().updateEntryModifiedDate("/ws/missing.md"),
		).resolves.toBeUndefined()

		expect(debugSpy).toHaveBeenCalled()
		debugSpy.mockRestore()
	})

	it("updateEntryModifiedDate updates timestamps when stat succeeds", async () => {
		const { store, fileSystemRepository } = createWorkspaceFsTestStore()
		store.setState({
			entries: [makeFile("/ws/note.md", "note.md")],
		})
		fileSystemRepository.stat.mockResolvedValueOnce({
			isDirectory: false,
			birthtime: 1000,
			mtime: 2000,
		})

		await store.getState().updateEntryModifiedDate("/ws/note.md")

		const [updated] = store.getState().entries
		expect(updated.createdAt).toBeInstanceOf(Date)
		expect(updated.modifiedAt).toBeInstanceOf(Date)
		expect(updated.createdAt.getTime()).toBe(1000)
		expect(updated.modifiedAt.getTime()).toBe(2000)
	})

	it("recordFsOperation sets lastFsOperationTime", () => {
		const { store } = createWorkspaceFsTestStore()
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(123456)

		store.getState().recordFsOperation()

		expect(store.getState().lastFsOperationTime).toBe(123456)
		dateNowSpy.mockRestore()
	})
})
