import { describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createTreeEntryActions } from "./entry-actions"

describe("tree/entry-actions", () => {
	it("entriesDeleted removes history paths in one batch", async () => {
		const { context, ports, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [
				{ path: "/ws/a.md", name: "a.md", isDirectory: false },
				{ path: "/ws/folder", name: "folder", isDirectory: true },
			],
			expandedDirectories: ["/ws/folder"],
			pinnedDirectories: ["/ws/folder"],
			tab: { id: 1, path: "/ws/a.md", name: "a", content: "" },
		})

		const actions = createTreeEntryActions(context)

		await actions.entriesDeleted({ paths: ["/ws/a.md", "/ws/folder"] })

		expect(ports.tab.closeTab).toHaveBeenCalledWith("/ws/a.md")
		expect(ports.tab.removePathsFromHistory).toHaveBeenCalledTimes(1)
		expect(ports.tab.removePathsFromHistory).toHaveBeenCalledWith([
			"/ws/a.md",
			"/ws/folder",
		])
		expect(ports.collection.onEntriesDeleted).toHaveBeenCalledWith({
			paths: ["/ws/a.md", "/ws/folder"],
		})
	})

	it("entriesDeleted closes the active tab when its parent directory is deleted", async () => {
		const { context, ports, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [{ path: "/ws/folder", name: "folder", isDirectory: true }],
			tab: {
				id: 1,
				path: "/ws/folder/note.md",
				name: "note",
				content: "",
			},
		})

		const actions = createTreeEntryActions(context)

		await actions.entriesDeleted({ paths: ["/ws/folder"] })

		expect(ports.tab.closeTab).toHaveBeenCalledWith("/ws/folder/note.md")
		expect(ports.tab.removePathsFromHistory).toHaveBeenCalledWith([
			"/ws/folder",
		])
	})

	it("entryRenamed updates tab/history via ports and notifies collection", async () => {
		const { context, ports, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [{ path: "/ws/folder", name: "folder", isDirectory: true }],
			expandedDirectories: ["/ws/folder"],
			pinnedDirectories: ["/ws/folder"],
		})

		const actions = createTreeEntryActions(context)

		await actions.entryRenamed({
			oldPath: "/ws/folder",
			newPath: "/ws/renamed",
			isDirectory: true,
			newName: "renamed",
		})

		expect(ports.tab.renameTab).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
		)
		expect(ports.tab.updateHistoryPath).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
		)
		expect(ports.collection.onEntryRenamed).toHaveBeenCalledWith({
			oldPath: "/ws/folder",
			newPath: "/ws/renamed",
			isDirectory: true,
			newName: "renamed",
		})
	})

	it("updateEntryModifiedDate updates createdAt and modifiedAt", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
		const actions = createTreeEntryActions(context)
		setState({
			workspacePath: "/ws",
			entries: [{ path: "/ws/a.md", name: "a.md", isDirectory: false }],
		})

		deps.fileSystemRepository.stat.mockResolvedValueOnce({
			isDirectory: false,
			birthtime: 1000,
			mtime: 2000,
		})

		await actions.updateEntryModifiedDate("/ws/a.md")

		const entry = getState().entries.find(
			(item: { path: string }) => item.path === "/ws/a.md",
		)
		expect(entry?.createdAt?.getTime()).toBe(1000)
		expect(entry?.modifiedAt?.getTime()).toBe(2000)
	})

	it("updateEntryModifiedDate swallows stat failures", async () => {
		const { context, deps } = createActionTestContext()
		const actions = createTreeEntryActions(context)
		deps.fileSystemRepository.stat.mockRejectedValueOnce(
			new Error("stat failed"),
		)
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})

		await expect(
			actions.updateEntryModifiedDate("/ws/missing.md"),
		).resolves.toBeUndefined()
		expect(debugSpy).toHaveBeenCalled()
		debugSpy.mockRestore()
	})
})
