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
		expect(ports.tab.removePathsFromHistory).not.toHaveBeenCalled()
		expect(events.emit).toHaveBeenNthCalledWith(1, {
			type: "workspace/tab-paths-removed",
			workspacePath: "/ws",
			paths: ["/ws/a.md", "/ws/folder"],
		})
		expect(events.emit).toHaveBeenNthCalledWith(2, {
			type: "workspace/entries-deleted",
			workspacePath: "/ws",
			paths: ["/ws/a.md", "/ws/folder"],
		})
	})

	it("entriesDeleted emits tab-path removal events for descendant cleanup", async () => {
		const { context, events, ports, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [{ path: "/ws/folder", name: "folder", isDirectory: true }],
		})

		const actions = createTreeEntryActions(context)

		await actions.entriesDeleted({ paths: ["/ws/folder"] })

		expect(ports.tab.closeTab).not.toHaveBeenCalled()
		expect(ports.tab.removePathsFromHistory).not.toHaveBeenCalled()
		expect(events.emit).toHaveBeenNthCalledWith(1, {
			type: "workspace/tab-paths-removed",
			workspacePath: "/ws",
			paths: ["/ws/folder"],
		})
		expect(events.emit).toHaveBeenNthCalledWith(2, {
			type: "workspace/entries-deleted",
			workspacePath: "/ws",
			paths: ["/ws/folder"],
		})
	})

	it("entriesDeleted emits tab cleanup before directory persistence", async () => {
		const { context, deps, events, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [{ path: "/ws/folder", name: "folder", isDirectory: true }],
			expandedDirectories: ["/ws/folder"],
		})
		deps.settingsRepository.persistExpandedDirectories.mockRejectedValueOnce(
			new Error("persist failed"),
		)

		const actions = createTreeEntryActions(context)

		await expect(
			actions.entriesDeleted({ paths: ["/ws/folder"] }),
		).rejects.toThrow("persist failed")

		expect(events.emit).toHaveBeenCalledTimes(1)
		expect(events.emit).toHaveBeenCalledWith({
			type: "workspace/tab-paths-removed",
			workspacePath: "/ws",
			paths: ["/ws/folder"],
		})
	})

	it("entryRenamed emits tab/history sync events and workspace rename events", async () => {
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

		expect(ports.tab.renameTab).not.toHaveBeenCalled()
		expect(ports.tab.updateHistoryPath).not.toHaveBeenCalled()
		expect(events.emit).toHaveBeenNthCalledWith(1, {
			type: "workspace/tab-path-renamed",
			workspacePath: "/ws",
			oldPath: "/ws/folder",
			newPath: "/ws/renamed",
			clearSyncedName: false,
		})
		expect(events.emit).toHaveBeenNthCalledWith(2, {
			type: "workspace/entry-renamed",
			workspacePath: "/ws",
			oldPath: "/ws/folder",
			newPath: "/ws/renamed",
			isDirectory: true,
			newName: "renamed",
		})
	})

	it("entryMoved emits tab/history sync events and workspace move events", async () => {
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

		expect(ports.tab.renameTab).not.toHaveBeenCalled()
		expect(events.emit).toHaveBeenNthCalledWith(1, {
			type: "workspace/tab-path-moved",
			workspacePath: "/ws",
			sourcePath: "/ws/folder",
			newPath: "/ws/archive/folder",
			refreshContent: false,
		})
		expect(events.emit).toHaveBeenNthCalledWith(2, {
			type: "workspace/entry-moved",
			workspacePath: "/ws",
			sourcePath: "/ws/folder",
			destinationDirPath: "/ws/archive",
			newPath: "/ws/archive/folder",
			isDirectory: true,
		})
	})

	it("entryMoved preserves refreshContent in tab move events", async () => {
		const { context, events, setState } = createActionTestContext()
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
			refreshContent: true,
		})

		expect(events.emit).toHaveBeenNthCalledWith(1, {
			type: "workspace/tab-path-moved",
			workspacePath: "/ws",
			sourcePath: "/ws/folder",
			newPath: "/ws/archive/folder",
			refreshContent: true,
		})
	})

	it("entryRenamed forwards clearSyncedName in tab rename events", async () => {
		const { context, events, setState } = createActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [{ path: "/ws/old.md", name: "old.md", isDirectory: false }],
		})

		const actions = createTreeEntryActions(context)

		await actions.entryRenamed({
			oldPath: "/ws/old.md",
			newPath: "/ws/new.md",
			isDirectory: false,
			newName: "new.md",
			clearSyncedName: true,
		})

		expect(events.emit).toHaveBeenNthCalledWith(1, {
			type: "workspace/tab-path-renamed",
			workspacePath: "/ws",
			oldPath: "/ws/old.md",
			newPath: "/ws/new.md",
			clearSyncedName: true,
		})
		expect(events.emit).toHaveBeenNthCalledWith(2, {
			type: "workspace/entry-renamed",
			workspacePath: "/ws",
			oldPath: "/ws/old.md",
			newPath: "/ws/new.md",
			isDirectory: false,
			newName: "new.md",
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
