import { describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createTreeActions } from "./actions"

describe("workspace-tree-actions", () => {
	it("getEntryByPath returns matching tree entry", () => {
		const { context, setState } = createActionTestContext()
		setState({
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [
						{
							path: "/ws/docs/a.md",
							name: "a.md",
							isDirectory: false,
						},
					],
				},
			],
		})
		const actions = createTreeActions(context)

		expect(actions.getEntryByPath("/ws/docs/a.md")).toEqual({
			path: "/ws/docs/a.md",
			name: "a.md",
			isDirectory: false,
		})
		expect(actions.getEntryByPath("/ws/missing.md")).toBeNull()
	})

	it("updateEntries refreshes collection state directly", () => {
		const { context, getState, setState } = createActionTestContext()
		const actions = createTreeActions(context)
		setState({ workspacePath: "/ws" })

		actions.updateEntries([
			{ path: "/ws/a.md", name: "a.md", isDirectory: false },
		])

		expect(getState().entries).toHaveLength(1)
		expect(getState().refreshCollectionEntries).toHaveBeenCalledTimes(1)
	})

	it("readWorkspaceEntriesFromPath reads recursively, filters hidden entries, and sorts results", async () => {
		const { context, deps } = createActionTestContext()
		const actions = createTreeActions(context)

		deps.fileSystemRepository.readDir.mockImplementation(
			async (path: string) => {
				if (path === "/ws") {
					return [
						{ name: "z.md", isDirectory: false },
						{ name: ".hidden", isDirectory: false },
						{ name: "docs", isDirectory: true },
						{ name: "Untitled.md", isDirectory: false },
					]
				}

				if (path === "/ws/docs") {
					return [
						{ name: "b.md", isDirectory: false },
						{ name: ".gitkeep", isDirectory: false },
						{ name: "a.md", isDirectory: false },
					]
				}

				return []
			},
		)

		deps.fileSystemRepository.stat.mockImplementation(async (path: string) => {
			if (path === "/ws/Untitled.md") {
				return { isDirectory: false, birthtime: 1000, mtime: 2000 }
			}

			if (path === "/ws/z.md") {
				return { isDirectory: false, birthtime: 3000, mtime: 4000 }
			}

			if (path === "/ws/docs/a.md") {
				return { isDirectory: false, birthtime: 5000, mtime: 6000 }
			}

			if (path === "/ws/docs/b.md") {
				return { isDirectory: false, birthtime: 7000, mtime: 8000 }
			}

			return { isDirectory: false, birthtime: undefined, mtime: undefined }
		})

		const entries = await actions.readWorkspaceEntriesFromPath("/ws")

		expect(entries.map((entry) => entry.name)).toEqual([
			"docs",
			"Untitled.md",
			"z.md",
		])
		expect(entries[0]?.children?.map((entry) => entry.name)).toEqual([
			"a.md",
			"b.md",
		])
		expect(entries[1]).toEqual(
			expect.objectContaining({
				path: "/ws/Untitled.md",
				createdAt: new Date(1000),
				modifiedAt: new Date(2000),
			}),
		)
		expect(entries[2]).toEqual(
			expect.objectContaining({
				path: "/ws/z.md",
				createdAt: new Date(3000),
				modifiedAt: new Date(4000),
			}),
		)
		expect(deps.fileSystemRepository.stat).not.toHaveBeenCalledWith(
			"/ws/.hidden",
		)
		expect(deps.fileSystemRepository.stat).not.toHaveBeenCalledWith(
			"/ws/docs/.gitkeep",
		)
	})

	it("refreshWorkspaceEntries reads entries through store action", async () => {
		const { context, getState, setState } = createActionTestContext()
		const actions = createTreeActions(context)
		const nextEntries = [{ path: "/ws/a.md", name: "a.md", isDirectory: false }]
		const readWorkspaceEntries = vi.fn().mockResolvedValue(nextEntries)
		setState({
			workspacePath: "/ws",
			readWorkspaceEntriesFromPath: readWorkspaceEntries,
		})

		await actions.refreshWorkspaceEntries()

		expect(readWorkspaceEntries).toHaveBeenCalledWith("/ws")
		expect(getState().syncDirectoryUiStateWithEntries).toHaveBeenCalledWith({
			workspacePath: "/ws",
			nextEntries,
			options: {
				persistExpandedWhenUnchanged: true,
			},
		})
		expect(getState().isTreeLoading).toBe(false)
	})
})
