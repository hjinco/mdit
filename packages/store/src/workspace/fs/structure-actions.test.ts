import { describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createFsStructureActions } from "./structure-actions"

describe("fs-structure-actions", () => {
	it("createFolder sanitizes separators and delegates entry creation", async () => {
		const { context, getState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryCreated = vi.fn().mockResolvedValue(undefined)

		const createdPath = await actions.createFolder("/ws", "  a/b\\c  ")

		expect(createdPath).toBe("/ws/abc")
		expect(getState().entryCreated).toHaveBeenCalled()
	})

	it("createNote sanitizes initialName separators before file creation", async () => {
		const { context, deps, getState } = createActionTestContext()
		const actions = createFsStructureActions(context)
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
		const { context, deps } = createActionTestContext()
		const actions = createFsStructureActions(context)

		await expect(
			actions.createNote("/ws", { initialName: " / \\\\ " }),
		).rejects.toThrow("Note name is empty after sanitization.")

		expect(deps.fileSystemRepository.writeTextFile).not.toHaveBeenCalled()
	})

	it("createAndOpenNote delegates tab opening to createNote", async () => {
		const { context, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		const createNote = vi.fn().mockResolvedValue("/ws/Untitled.md")

		setState({
			workspacePath: "/ws",
			createNote,
		})

		await actions.createAndOpenNote()

		expect(createNote).toHaveBeenCalledWith("/ws", { openTab: true })
		expect(getState().createNote).toBe(createNote)
	})

	it("createAndOpenNote uses the active tab directory when collection path is unset", async () => {
		const { context, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		const createNote = vi.fn().mockResolvedValue("/ws/folder/Untitled.md")

		setState({
			workspacePath: "/ws",
			currentCollectionPath: null,
			tabs: [
				{
					id: 1,
					path: "/ws/folder/note.md",
					name: "note",
					content: "",
				},
			],
			activeTabId: 1,
			createNote,
		})

		await actions.createAndOpenNote()

		expect(createNote).toHaveBeenCalledWith("/ws/folder", { openTab: true })
	})

	it("createNote opens the created tab directly when requested", async () => {
		const { context, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryCreated = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		const createdPath = await actions.createNote("/ws", { openTab: true })

		expect(createdPath).toBe("/ws/Untitled.md")
		expect(getState().openTab).toHaveBeenCalledWith(
			"/ws/Untitled.md",
			false,
			false,
			{ initialSelection: "title" },
		)
		expect(getState().selectedEntryPaths).toEqual(new Set(["/ws/Untitled.md"]))
		expect(getState().selectionAnchorPath).toBe("/ws/Untitled.md")
	})

	it("renameEntry sanitizes separators from newName", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

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

	it("renameEntry allows case-only path changes when destination exists", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		deps.fileSystemRepository.exists.mockResolvedValueOnce(true)
		setState({ workspacePath: "/ws" })

		const renamedPath = await actions.renameEntry(
			{
				path: "/ws/folder",
				name: "folder",
				isDirectory: true,
			},
			"Folder",
		)

		expect(renamedPath).toBe("/ws/Folder")
		expect(deps.fileSystemRepository.rename).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/Folder",
		)
		expect(getState().entryRenamed).toHaveBeenCalledWith(
			expect.objectContaining({
				newPath: "/ws/Folder",
				newName: "Folder",
			}),
		)
	})

	it("renameEntry blocks rename when destination path exists and is not case-only", async () => {
		const { context, deps, getState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		deps.fileSystemRepository.exists.mockResolvedValueOnce(true)

		const renamedPath = await actions.renameEntry(
			{
				path: "/ws/folder",
				name: "folder",
				isDirectory: true,
			},
			"another",
		)

		expect(renamedPath).toBe("/ws/folder")
		expect(deps.fileSystemRepository.rename).not.toHaveBeenCalled()
		expect(getState().entryRenamed).not.toHaveBeenCalled()
	})

	it("renameEntry blocks rename for locked entries", async () => {
		const { context, deps, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		setState({
			aiLockedEntryPaths: new Set(["/ws/folder/note.md"]),
		})

		const renamedPath = await actions.renameEntry(
			{
				path: "/ws/folder/note.md",
				name: "note.md",
				isDirectory: false,
			},
			"updated.md",
		)

		expect(renamedPath).toBe("/ws/folder/note.md")
		expect(deps.fileSystemRepository.rename).not.toHaveBeenCalled()
	})

	it("renameEntry allows locked source path when explicitly enabled", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({
			workspacePath: "/ws",
			aiLockedEntryPaths: new Set(["/ws/folder/note.md"]),
		})

		const renamedPath = await actions.renameEntry(
			{
				path: "/ws/folder/note.md",
				name: "note.md",
				isDirectory: false,
			},
			"updated.md",
			{ allowLockedSourcePath: true },
		)

		expect(renamedPath).toBe("/ws/folder/updated.md")
		expect(deps.fileSystemRepository.rename).toHaveBeenCalledWith(
			"/ws/folder/note.md",
			"/ws/folder/updated.md",
		)
		expect(getState().entryRenamed).toHaveBeenCalledWith(
			expect.objectContaining({
				oldPath: "/ws/folder/note.md",
				newPath: "/ws/folder/updated.md",
			}),
		)
	})

	it("renameEntry updates tab path in edit mode without entryRenamed", async () => {
		const { context, deps, setState, getState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ isEditMode: true, workspacePath: "/ws" })

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
		expect(getState().renameTab).toHaveBeenCalledWith(
			"/ws/old.md",
			"/ws/new.md",
		)
		expect(getState().updateHistoryPath).toHaveBeenCalledWith(
			"/ws/old.md",
			"/ws/new.md",
		)
		expect(getState().entryRenamed).not.toHaveBeenCalled()
	})

	it("renameEntry rejects in edit mode without workspace", async () => {
		const { context, deps, setState, getState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ isEditMode: true, workspacePath: null })

		await expect(
			actions.renameEntry(
				{
					path: "/tmp/old.md",
					name: "old.md",
					isDirectory: false,
				},
				"new.md",
			),
		).rejects.toThrow("Workspace path is not set")

		expect(deps.fileSystemRepository.rename).not.toHaveBeenCalled()
		expect(getState().renameTab).not.toHaveBeenCalled()
		expect(getState().entryRenamed).not.toHaveBeenCalled()
	})

	it("renameEntry forwards rename metadata for files", async () => {
		const { context, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		await actions.renameEntry(
			{
				path: "/ws/old.md",
				name: "old.md",
				isDirectory: false,
			},
			"new.md",
		)

		expect(getState().entryRenamed).toHaveBeenCalledWith({
			oldPath: "/ws/old.md",
			newPath: "/ws/new.md",
			isDirectory: false,
			newName: "new.md",
		})
	})

	it("renameEntry waits for unsaved active tab under renamed directory", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({
			workspacePath: "/ws",
			openTabSnapshots: [{ path: "/ws/folder/note.md", isSaved: false }],
		})

		vi.useFakeTimers()

		try {
			const renamePromise = actions.renameEntry(
				{
					path: "/ws/folder",
					name: "folder",
					isDirectory: true,
				},
				"renamed",
			)

			await vi.advanceTimersByTimeAsync(199)
			expect(deps.fileSystemRepository.rename).not.toHaveBeenCalled()

			setState({
				openTabSnapshots: [{ path: "/ws/folder/note.md", isSaved: true }],
			})
			await vi.advanceTimersByTimeAsync(1)

			const renamedPath = await renamePromise
			expect(renamedPath).toBe("/ws/renamed")
			expect(deps.fileSystemRepository.rename).toHaveBeenCalledWith(
				"/ws/folder",
				"/ws/renamed",
			)
		} finally {
			vi.useRealTimers()
		}
	})

	it("renameEntry leaves link indexing to backend watcher", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		const renamedPath = await actions.renameEntry(
			{
				path: "/ws/old.md",
				name: "old.md",
				isDirectory: false,
			},
			"new.md",
		)

		expect(renamedPath).toBe("/ws/new.md")
		expect(deps.linkIndexing.getBacklinks).not.toHaveBeenCalled()
		expect(deps.linkIndexing.resolveWikiLink).not.toHaveBeenCalled()
		expect(deps.linkIndexing.renameIndexedNote).not.toHaveBeenCalled()
	})

	it("deleteEntries uses moveManyToTrash for multiple items", async () => {
		const { context, deps, getState } = createActionTestContext()
		const actions = createFsStructureActions(context)
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

	it("deleteEntries waits for unsaved active tab under deleted directory", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)
		setState({
			openTabSnapshots: [{ path: "/ws/folder/note.md", isSaved: false }],
		})

		vi.useFakeTimers()

		try {
			const deletePromise = actions.deleteEntries(["/ws/folder"])

			await vi.advanceTimersByTimeAsync(199)
			expect(deps.fileSystemRepository.moveToTrash).not.toHaveBeenCalled()

			setState({
				openTabSnapshots: [{ path: "/ws/folder/note.md", isSaved: true }],
			})
			await vi.advanceTimersByTimeAsync(1)

			await deletePromise
			expect(deps.fileSystemRepository.moveToTrash).toHaveBeenCalledWith(
				"/ws/folder",
			)
		} finally {
			vi.useRealTimers()
		}
	})

	it("deleteEntries blocks deletion when request includes locked paths", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)
		setState({
			aiLockedEntryPaths: new Set(["/ws/folder/locked.md"]),
		})

		await actions.deleteEntries(["/ws/folder"])

		expect(deps.fileSystemRepository.moveToTrash).not.toHaveBeenCalled()
		expect(deps.fileSystemRepository.moveManyToTrash).not.toHaveBeenCalled()
		expect(getState().entriesDeleted).not.toHaveBeenCalled()
	})

	it("deleteEntries leaves markdown indexing updates to backend watcher", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
		const actions = createFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		await actions.deleteEntries(["/ws/target.md"])

		expect(deps.linkIndexing.getBacklinks).not.toHaveBeenCalled()
		expect(deps.linkIndexing.deleteIndexedNote).not.toHaveBeenCalled()
	})
})
