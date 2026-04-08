import { describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createTreeEntryActions } from "./entry-actions"

describe("tree/entry-actions", () => {
	it("entryCreated updates entries without emitting a tree event", async () => {
		const { context, getState, setState } = createActionTestContext()
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

		expect(getState().updateEntries).toHaveBeenCalledWith(
			[
				{
					path: "/ws/a.md",
					name: "a.md",
					isDirectory: false,
				},
			],
			{ emitEvent: false },
		)
	})

	it("entriesDeleted syncs tabs and collection before persistence", async () => {
		const { context, deps, getState, setState } = createActionTestContext()
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

		expect(getState().removePathsFromHistory).toHaveBeenCalledWith([
			"/ws/folder",
		])
		expect(getState().onEntriesDeleted).toHaveBeenCalledWith({
			paths: ["/ws/folder"],
		})
	})

	it("entryRenamed syncs tab paths, history, and collection state", async () => {
		const { context, getState, setState } = createActionTestContext()
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

		expect(getState().renameTab).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
			{
				clearSyncedName: false,
			},
		)
		expect(getState().updateHistoryPath).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
		)
		expect(getState().onEntryRenamed).toHaveBeenCalledWith({
			sourcePath: "/ws/folder",
			targetPath: "/ws/renamed",
			isDirectory: true,
		})
	})

	it("entryMoved syncs tab paths, history, and collection state", async () => {
		const { context, getState, setState } = createActionTestContext()
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

		expect(getState().renameTab).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/archive/folder",
			{
				refreshContent: true,
			},
		)
		expect(getState().updateHistoryPath).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/archive/folder",
		)
		expect(getState().onEntryMoved).toHaveBeenCalledWith({
			sourcePath: "/ws/folder",
			targetPath: "/ws/archive/folder",
			isDirectory: true,
		})
	})

	it("entryRenamed forwards clearSyncedName to direct tab sync", async () => {
		const { context, getState, setState } = createActionTestContext()
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

		expect(getState().renameTab).toHaveBeenCalledWith(
			"/ws/old.md",
			"/ws/new.md",
			{
				clearSyncedName: true,
			},
		)
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
