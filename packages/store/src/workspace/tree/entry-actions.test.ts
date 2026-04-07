import { describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createTreeEntryActions } from "./entry-actions"

describe("tree/entry-actions", () => {
	it("entryCreated emits workspace entry created events", async () => {
		const { context, events, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [],
		})

		const actions = createTreeEntryActions(context)

		await actions.entryCreated({
			parentPath: "/ws",
			entry: {
				path: "/ws/a.md",
				name: "a.md",
				isDirectory: false,
			},
			expandParent: true,
		})

		expect(events.emit).toHaveBeenCalledWith({
			type: "workspace/entry-created",
			workspacePath: "/ws",
			parentPath: "/ws",
			entry: {
				path: "/ws/a.md",
				name: "a.md",
				isDirectory: false,
			},
			expandParent: true,
			expandNewDirectory: false,
		})
	})

	it("entriesDeleted removes history paths in one batch", async () => {
		const { context, events, ports, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [
				{ path: "/ws/a.md", name: "a.md", isDirectory: false },
				{ path: "/ws/folder", name: "folder", isDirectory: true },
			],
			expandedDirectories: ["/ws/folder"],
			pinnedDirectories: ["/ws/folder"],
		})

		const actions = createTreeEntryActions(context)

		await actions.entriesDeleted({ paths: ["/ws/a.md", "/ws/folder"] })

		expect(ports.tab.closeTab).not.toHaveBeenCalled()
		expect(ports.tab.removePathsFromHistory).toHaveBeenCalledTimes(1)
		expect(ports.tab.removePathsFromHistory).toHaveBeenCalledWith([
			"/ws/a.md",
			"/ws/folder",
		])
		expect(events.emit).toHaveBeenCalledWith({
			type: "workspace/entries-deleted",
			workspacePath: "/ws",
			paths: ["/ws/a.md", "/ws/folder"],
		})
	})

	it("entriesDeleted delegates descendant tab cleanup to history removal", async () => {
		const { context, ports, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [{ path: "/ws/folder", name: "folder", isDirectory: true }],
		})

		const actions = createTreeEntryActions(context)

		await actions.entriesDeleted({ paths: ["/ws/folder"] })

		expect(ports.tab.closeTab).not.toHaveBeenCalled()
		expect(ports.tab.removePathsFromHistory).toHaveBeenCalledWith([
			"/ws/folder",
		])
	})

	it("entryRenamed updates tab/history via ports and emits workspace rename events", async () => {
		const { context, events, ports, setState } = createActionTestContext()
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
			{ clearSyncedName: false },
		)
		expect(ports.tab.updateHistoryPath).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
		)
		expect(events.emit).toHaveBeenCalledWith({
			type: "workspace/entry-renamed",
			workspacePath: "/ws",
			oldPath: "/ws/folder",
			newPath: "/ws/renamed",
			isDirectory: true,
			newName: "renamed",
		})
	})

	it("entryMoved emits workspace move events", async () => {
		const { context, events, ports, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [{ path: "/ws/folder", name: "folder", isDirectory: true }],
		})

		const actions = createTreeEntryActions(context)

		await actions.entryMoved({
			sourcePath: "/ws/folder",
			destinationDirPath: "/ws/archive",
			newPath: "/ws/archive/folder",
			isDirectory: true,
		})

		expect(ports.tab.renameTab).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/archive/folder",
			{ refreshContent: false },
		)
		expect(events.emit).toHaveBeenCalledWith({
			type: "workspace/entry-moved",
			workspacePath: "/ws",
			sourcePath: "/ws/folder",
			destinationDirPath: "/ws/archive",
			newPath: "/ws/archive/folder",
			isDirectory: true,
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
