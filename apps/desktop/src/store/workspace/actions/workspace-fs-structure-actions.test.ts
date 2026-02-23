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

	it("renameEntry rewrites backlinks and refreshes link index for markdown notes", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		deps.linkIndexing.getBacklinks.mockResolvedValue([
			{ relPath: "source.md", fileName: "source" },
		])
		deps.fileSystemRepository.readTextFile.mockResolvedValue(
			"[A](./old.md)\n[[old|Alias]]",
		)
		deps.linkIndexing.resolveWikiLink.mockResolvedValue({
			canonicalTarget: "old",
			resolvedRelPath: "old.md",
			matchCount: 1,
			disambiguated: false,
			unresolved: false,
		})

		const renamedPath = await actions.renameEntry(
			{
				path: "/ws/old.md",
				name: "old.md",
				isDirectory: false,
			},
			"new.md",
		)

		expect(renamedPath).toBe("/ws/new.md")
		expect(deps.linkIndexing.getBacklinks).toHaveBeenCalledWith(
			"/ws",
			"/ws/old.md",
		)
		expect(deps.linkIndexing.getBacklinks).toHaveBeenCalledWith(
			"/ws",
			"/ws/new.md",
		)
		expect(deps.fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
			"/ws/source.md",
			"[A](new.md)\n[[new|Alias]]",
		)
		expect(deps.linkIndexing.renameIndexedNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/old.md",
			"/ws/new.md",
		)
		expect(deps.linkIndexing.indexNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/new.md",
		)
		expect(deps.linkIndexing.indexNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/source.md",
		)
	})

	it("renameEntry rewrites wiki links when resolver returns unresolved after rename", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		deps.linkIndexing.getBacklinks.mockResolvedValue([
			{ relPath: "folder/source.md", fileName: "source" },
		])
		deps.fileSystemRepository.readTextFile.mockResolvedValue("[[old|Alias]]")
		deps.linkIndexing.resolveWikiLink.mockResolvedValue({
			canonicalTarget: "old",
			resolvedRelPath: null,
			matchCount: 0,
			disambiguated: false,
			unresolved: true,
		})

		await actions.renameEntry(
			{
				path: "/ws/folder/old.md",
				name: "old.md",
				isDirectory: false,
			},
			"new.md",
		)

		expect(deps.fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
			"/ws/folder/source.md",
			"[[folder/new|Alias]]",
		)
	})

	it("renameEntry refreshes pre-existing unresolved backlinks for the new path", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		deps.linkIndexing.getBacklinks
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{ relPath: "unresolved-new.md", fileName: "unresolved-new" },
			])

		await actions.renameEntry(
			{
				path: "/ws/old.md",
				name: "old.md",
				isDirectory: false,
			},
			"new.md",
		)

		expect(deps.linkIndexing.renameIndexedNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/old.md",
			"/ws/new.md",
		)
		expect(deps.linkIndexing.indexNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/unresolved-new.md",
		)
	})

	it("renameEntry keeps rename successful and logs silent warning on backlink load failure", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entryRenamed = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		deps.linkIndexing.getBacklinks.mockRejectedValue(new Error("boom"))
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

		try {
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
			expect(warnSpy).toHaveBeenCalled()
		} finally {
			warnSpy.mockRestore()
		}
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

	it("deleteEntries removes indexed markdown note and reindexes backlink sources", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		deps.linkIndexing.getBacklinks.mockResolvedValue([
			{ relPath: "source.md", fileName: "source" },
		])

		await actions.deleteEntries(["/ws/target.md"])

		expect(deps.linkIndexing.getBacklinks).toHaveBeenCalledWith(
			"/ws",
			"/ws/target.md",
		)
		expect(deps.linkIndexing.deleteIndexedNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/target.md",
		)
		expect(deps.linkIndexing.indexNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/source.md",
		)
	})

	it("deleteEntries skips indexing sync for non-markdown paths", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		await actions.deleteEntries(["/ws/file.txt"])

		expect(deps.linkIndexing.getBacklinks).not.toHaveBeenCalled()
		expect(deps.linkIndexing.deleteIndexedNote).not.toHaveBeenCalled()
		expect(deps.linkIndexing.indexNote).not.toHaveBeenCalled()
	})

	it("deleteEntries removes indexed markdown notes under deleted directory", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/folder",
					name: "folder",
					isDirectory: true,
					children: [
						{
							path: "/ws/folder/target.md",
							name: "target.md",
							isDirectory: false,
						},
						{
							path: "/ws/folder/nested",
							name: "nested",
							isDirectory: true,
							children: [
								{
									path: "/ws/folder/nested/deep.md",
									name: "deep.md",
									isDirectory: false,
								},
							],
						},
						{
							path: "/ws/folder/ignored.txt",
							name: "ignored.txt",
							isDirectory: false,
						},
					],
				},
			],
		})

		await actions.deleteEntries(["/ws/folder"])

		expect(deps.linkIndexing.deleteIndexedNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/folder/target.md",
		)
		expect(deps.linkIndexing.deleteIndexedNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/folder/nested/deep.md",
		)
		expect(deps.linkIndexing.deleteIndexedNote).toHaveBeenCalledTimes(2)
	})

	it("deleteEntries reindexes only backlink sources outside deleted directory", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/folder",
					name: "folder",
					isDirectory: true,
					children: [
						{
							path: "/ws/folder/target.md",
							name: "target.md",
							isDirectory: false,
						},
					],
				},
			],
		})

		deps.linkIndexing.getBacklinks.mockResolvedValue([
			{ relPath: "source.md", fileName: "source" },
			{ relPath: "folder/internal.md", fileName: "internal" },
		])

		await actions.deleteEntries(["/ws/folder"])

		expect(deps.linkIndexing.indexNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/source.md",
		)
		expect(deps.linkIndexing.indexNote).not.toHaveBeenCalledWith(
			"/ws",
			"/ws/folder/internal.md",
		)
	})

	it("deleteEntries does not reindex backlink sources that are deleted together", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		deps.linkIndexing.getBacklinks.mockResolvedValue([
			{ relPath: "source.md", fileName: "source" },
		])

		await actions.deleteEntries(["/ws/target.md", "/ws/source.md"])

		expect(deps.linkIndexing.deleteIndexedNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/target.md",
		)
		expect(deps.linkIndexing.deleteIndexedNote).toHaveBeenCalledWith(
			"/ws",
			"/ws/source.md",
		)
		expect(deps.linkIndexing.indexNote).not.toHaveBeenCalled()
	})

	it("deleteEntries keeps filesystem deletion successful on indexing sync failures", async () => {
		const { context, deps, getState, setState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceFsStructureActions(context)
		getState().entriesDeleted = vi.fn().mockResolvedValue(undefined)
		setState({ workspacePath: "/ws" })

		deps.linkIndexing.getBacklinks.mockResolvedValue([
			{ relPath: "source.md", fileName: "source" },
		])
		deps.linkIndexing.deleteIndexedNote.mockRejectedValue(
			new Error("delete-index-failed"),
		)
		deps.linkIndexing.indexNote.mockRejectedValue(new Error("reindex-failed"))
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

		try {
			await expect(
				actions.deleteEntries(["/ws/target.md"]),
			).resolves.toBeUndefined()
			expect(deps.fileSystemRepository.moveToTrash).toHaveBeenCalledWith(
				"/ws/target.md",
			)
			expect(getState().entriesDeleted).toHaveBeenCalledWith({
				paths: ["/ws/target.md"],
			})
			expect(warnSpy).toHaveBeenCalled()
		} finally {
			warnSpy.mockRestore()
		}
	})
})
