import { describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createWatchActions } from "./index"

describe("watch/actions", () => {
	const flushQueue = async () => {
		await Promise.resolve()
		await Promise.resolve()
		await new Promise((resolve) => setTimeout(resolve, 0))
	}

	const watchBatch = (
		seqInStream: number,
		ops: any[],
		streamId = "stream-1",
	) => ({
		streamId,
		seqInStream,
		ops,
		emittedAtUnixMs: 1000 + seqInStream,
	})

	const fullRescanBatch = (seqInStream: number, reason = "watcherError") =>
		watchBatch(seqInStream, [{ type: "fullRescan", reason }])

	it("unwatchWorkspace runs unwatch function and clears state", () => {
		const { context, setState, getState, originJournal } =
			createActionTestContext()
		const actions = createWatchActions(context)
		const unwatch = vi.fn()
		setState({ unwatchFn: unwatch, workspacePath: "/ws" })

		actions.unwatchWorkspace()

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(originJournal.clearWorkspace).toHaveBeenCalledWith("/ws")
		expect(getState().unwatchFn).toBeNull()
	})

	it("watchWorkspace clears stale unwatchFn when watch start fails", async () => {
		const { context, setState, getState, deps } = createActionTestContext()
		const actions = createWatchActions(context)
		const previousUnwatch = vi.fn()
		const unlisten = vi.fn()

		setState({
			workspacePath: "/ws",
			unwatchFn: previousUnwatch,
		})

		deps.watcher.subscribe.mockResolvedValue(unlisten)
		deps.watcher.start.mockRejectedValueOnce(new Error("start failed"))

		await actions.watchWorkspace()
		await Promise.resolve()

		expect(previousUnwatch).toHaveBeenCalledTimes(1)
		expect(getState().unwatchFn).toBeNull()
		expect(unlisten).toHaveBeenCalledTimes(1)
	})

	it("watchWorkspace waits for previous async unwatch cleanup before start", async () => {
		const { context, setState, deps } = createActionTestContext()
		const actions = createWatchActions(context)
		let resolveCleanup!: () => void
		const previousUnwatch = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveCleanup = resolve
				}),
		)

		setState({
			workspacePath: "/ws",
			unwatchFn: previousUnwatch,
		})

		const watchPromise = actions.watchWorkspace()
		await Promise.resolve()

		expect(previousUnwatch).toHaveBeenCalledTimes(1)
		expect(deps.watcher.subscribe).not.toHaveBeenCalled()
		expect(deps.watcher.start).not.toHaveBeenCalled()

		resolveCleanup()
		await watchPromise

		expect(deps.watcher.start).toHaveBeenCalledWith("/ws")
	})

	it("ignores non-rescan local-only batches", async () => {
		const { context, setState, getState, originJournal, deps, events } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })

		originJournal.resolve.mockReturnValue({
			externalRelPaths: [],
			localRelPaths: ["docs/local.md"],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(1, [
				{
					type: "pathState",
					relPath: "docs/local.md",
					before: "missing",
					after: "file",
				},
			]),
		})
		await flushQueue()

		expect(originJournal.resolve).toHaveBeenCalledWith({
			workspacePath: "/ws",
			relPaths: ["docs/local.md"],
		})
		expect(events.emit).not.toHaveBeenCalledWith({
			type: "workspace/tab-content-refresh-requested",
			workspacePath: "/ws",
			path: "/ws/docs/local.md",
			content: "",
			preserveSelection: true,
		})
		expect(deps.fileSystemRepository.readDir).not.toHaveBeenCalled()
		expect(getState().refreshWorkspaceEntries).not.toHaveBeenCalled()
	})

	it("applies file create as entryCreated for external watch changes", async () => {
		const { context, setState, originJournal, deps, getState } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [],
				},
			],
		})

		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/created.md"],
			localRelPaths: [],
		})
		deps.fileSystemRepository.stat.mockResolvedValueOnce({
			isDirectory: false,
			birthtime: 1000,
			mtime: 2000,
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(2, [
				{
					type: "pathState",
					relPath: "docs/created.md",
					before: "missing",
					after: "file",
				},
			]),
		})
		await flushQueue()

		expect(getState().entryCreated).toHaveBeenCalledWith({
			parentPath: "/ws/docs",
			entry: expect.objectContaining({
				path: "/ws/docs/created.md",
				name: "created.md",
				isDirectory: false,
			}),
		})
		expect(deps.fileSystemRepository.readDir).not.toHaveBeenCalled()
		expect(getState().refreshWorkspaceEntries).not.toHaveBeenCalled()
	})

	it("applies directory create as entryCreated with snapshot children", async () => {
		const { context, setState, originJournal, deps, getState } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [],
				},
			],
		})
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/new-dir"],
			localRelPaths: [],
		})
		deps.fileSystemRepository.readDir.mockImplementation(
			async (path: string) => {
				if (path === "/ws/docs/new-dir") {
					return [{ name: "note.md", isDirectory: false }]
				}
				return []
			},
		)
		deps.fileSystemRepository.stat.mockImplementation(async (path: string) => {
			if (path === "/ws/docs/new-dir") {
				return { isDirectory: true, birthtime: 1100, mtime: 2100 }
			}
			if (path === "/ws/docs/new-dir/note.md") {
				return { isDirectory: false, birthtime: 1200, mtime: 2200 }
			}
			return { isDirectory: false, birthtime: undefined, mtime: undefined }
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(3, [
				{
					type: "pathState",
					relPath: "docs/new-dir",
					before: "missing",
					after: "directory",
				},
			]),
		})
		await flushQueue()

		expect(getState().entryCreated).toHaveBeenCalledWith({
			parentPath: "/ws/docs",
			entry: expect.objectContaining({
				path: "/ws/docs/new-dir",
				name: "new-dir",
				isDirectory: true,
				children: [
					expect.objectContaining({
						path: "/ws/docs/new-dir/note.md",
						name: "note.md",
						isDirectory: false,
					}),
				],
			}),
		})
		expect(getState().refreshWorkspaceEntries).not.toHaveBeenCalled()
	})

	it("applies deleted entries via entriesDeleted", async () => {
		const { context, setState, originJournal, getState, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/deleted.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(4, [
				{
					type: "pathState",
					relPath: "docs/deleted.md",
					before: "file",
					after: "missing",
				},
			]),
		})
		await flushQueue()

		expect(getState().entriesDeleted).toHaveBeenCalledWith({
			paths: ["/ws/docs/deleted.md"],
		})
	})

	it("applies deleted directories via entriesDeleted", async () => {
		const { context, setState, originJournal, getState, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(5, [
				{
					type: "pathState",
					relPath: "docs",
					before: "directory",
					after: "missing",
				},
			]),
		})
		await flushQueue()

		expect(getState().entriesDeleted).toHaveBeenCalledWith({
			paths: ["/ws/docs"],
		})
	})

	it("maps same-parent move to entryRenamed", async () => {
		const { context, setState, originJournal, getState, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [
						{
							path: "/ws/docs/old.md",
							name: "old.md",
							isDirectory: false,
						},
					],
				},
			],
		})
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/old.md", "docs/new.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(6, [
				{
					type: "move",
					fromRel: "docs/old.md",
					toRel: "docs/new.md",
					entryKind: "file",
				},
			]),
		})
		await flushQueue()

		expect(getState().entryRenamed).toHaveBeenCalledWith({
			oldPath: "/ws/docs/old.md",
			newPath: "/ws/docs/new.md",
			newName: "new.md",
			isDirectory: false,
		})
		expect(getState().entryMoved).not.toHaveBeenCalled()
	})

	it("maps cross-parent move to entryMoved and preserves newPath", async () => {
		const { context, setState, originJournal, getState, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [
						{
							path: "/ws/docs/old.md",
							name: "old.md",
							isDirectory: false,
						},
					],
				},
				{
					path: "/ws/archive",
					name: "archive",
					isDirectory: true,
					children: [],
				},
			],
		})
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/old.md", "archive/renamed.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(7, [
				{
					type: "move",
					fromRel: "docs/old.md",
					toRel: "archive/renamed.md",
					entryKind: "file",
				},
			]),
		})
		await flushQueue()

		expect(getState().entryMoved).toHaveBeenCalledWith({
			sourcePath: "/ws/docs/old.md",
			destinationDirPath: "/ws/archive",
			newPath: "/ws/archive/renamed.md",
			isDirectory: false,
		})
		expect(getState().entryRenamed).not.toHaveBeenCalled()
	})

	it("maps cross-parent directory move+rename to entryMoved", async () => {
		const { context, setState, originJournal, getState, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [
						{
							path: "/ws/docs/folder",
							name: "folder",
							isDirectory: true,
							children: [],
						},
					],
				},
				{
					path: "/ws/archive",
					name: "archive",
					isDirectory: true,
					children: [],
				},
			],
		})
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/folder", "archive/folder-renamed"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(8, [
				{
					type: "move",
					fromRel: "docs/folder",
					toRel: "archive/folder-renamed",
					entryKind: "directory",
				},
			]),
		})
		await flushQueue()

		expect(getState().entryMoved).toHaveBeenCalledWith({
			sourcePath: "/ws/docs/folder",
			destinationDirPath: "/ws/archive",
			newPath: "/ws/archive/folder-renamed",
			isDirectory: true,
		})
	})

	it("reloads open tabs when policy has multiple open snapshots", async () => {
		const { context, setState, originJournal, deps, events, ports } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [
						{
							path: "/ws/docs/second.md",
							name: "second.md",
							isDirectory: false,
						},
					],
				},
			],
		})
		ports.tab.getOpenTabSnapshots.mockReturnValue([
			{ path: "/ws/docs/first.md", isSaved: true },
			{ path: "/ws/docs/second.md", isSaved: true },
		])
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/second.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(9, [
				{
					type: "pathState",
					relPath: "docs/second.md",
					before: "file",
					after: "file",
				},
			]),
		})
		await flushQueue()

		expect(events.emit).toHaveBeenCalledWith({
			type: "workspace/tab-content-refresh-requested",
			workspacePath: "/ws",
			path: "/ws/docs/second.md",
			content: "",
			preserveSelection: true,
		})
	})

	it("reloads the active markdown tab and updates metadata for external file changes", async () => {
		const { context, setState, originJournal, getState, deps, events } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			openTabSnapshots: [{ path: "/ws/docs/a.md", isSaved: true }],
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
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/a.md"],
			localRelPaths: [],
		})
		deps.fileSystemRepository.readTextFile.mockResolvedValueOnce(
			"fresh-content",
		)

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(9, [
				{
					type: "pathState",
					relPath: "docs/a.md",
					before: "file",
					after: "file",
				},
			]),
		})
		await flushQueue()

		expect(events.emit).toHaveBeenCalledWith({
			type: "workspace/tab-content-refresh-requested",
			workspacePath: "/ws",
			path: "/ws/docs/a.md",
			content: "fresh-content",
			preserveSelection: true,
		})
		expect(getState().updateEntryModifiedDate).toHaveBeenCalledWith(
			"/ws/docs/a.md",
		)
	})

	it("falls back to partial directory refresh for modified directories", async () => {
		const { context, setState, originJournal, deps } = createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [],
				},
			],
		})
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(10, [
				{
					type: "pathState",
					relPath: "docs",
					before: "directory",
					after: "directory",
				},
			]),
		})
		await flushQueue()

		expect(deps.fileSystemRepository.readDir).toHaveBeenCalledWith("/ws/docs")
	})

	it("falls back to parent directory refresh when move source is missing", async () => {
		const { context, setState, originJournal, deps } = createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [],
				},
				{
					path: "/ws/archive",
					name: "archive",
					isDirectory: true,
					children: [],
				},
			],
		})
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/missing.md", "archive/missing.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(11, [
				{
					type: "move",
					fromRel: "docs/missing.md",
					toRel: "archive/missing.md",
					entryKind: "file",
				},
			]),
		})
		await flushQueue()

		expect(deps.fileSystemRepository.readDir).toHaveBeenCalledWith("/ws/docs")
		expect(deps.fileSystemRepository.readDir).toHaveBeenCalledWith(
			"/ws/archive",
		)
	})

	it("always refreshes on rescan batches without origin filtering", async () => {
		const { context, setState, getState, originJournal, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: fullRescanBatch(3),
		})
		await flushQueue()

		expect(originJournal.resolve).not.toHaveBeenCalled()
		expect(getState().refreshWorkspaceEntries).toHaveBeenCalledTimes(1)
	})

	it("falls back to full refresh when partial fallback refresh fails", async () => {
		const { context, setState, originJournal, getState, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [],
				},
			],
			updateEntries: vi.fn(() => {
				throw new Error("update failed")
			}),
		})
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(12, [
				{
					type: "pathState",
					relPath: "docs",
					before: "directory",
					after: "directory",
				},
			]),
		})
		await flushQueue()

		expect(getState().refreshWorkspaceEntries).toHaveBeenCalledTimes(1)
	})

	it("filters hidden paths before origin resolution", async () => {
		const { context, setState, originJournal, deps } = createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })
		originJournal.resolve.mockReturnValue({
			externalRelPaths: [],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(4, [
				{
					type: "pathState",
					relPath: "visible.md",
					before: "missing",
					after: "file",
				},
				{
					type: "pathState",
					relPath: ".hidden/secret.md",
					before: "missing",
					after: "file",
				},
			]),
		})
		await flushQueue()

		expect(originJournal.resolve).toHaveBeenCalledWith({
			workspacePath: "/ws",
			relPaths: ["visible.md"],
		})
	})

	it("reconciles the target subtree on scanTree batches", async () => {
		const { context, setState, getState, originJournal, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [],
				},
			],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(13, [
				{
					type: "scanTree",
					relPrefix: "docs",
					reason: "directoryMoveWithin",
				},
			]),
		})
		await flushQueue()

		expect(originJournal.resolve).not.toHaveBeenCalled()
		expect(getState().readWorkspaceEntriesFromPath).toHaveBeenCalledWith(
			"/ws/docs",
		)
		expect(getState().refreshWorkspaceEntries).not.toHaveBeenCalled()
	})

	it("applies directory moves before reconciling scanTree descendants", async () => {
		const { context, setState, getState, originJournal, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [
						{
							path: "/ws/docs/folder",
							name: "folder",
							isDirectory: true,
							children: [],
						},
					],
				},
				{
					path: "/ws/archive",
					name: "archive",
					isDirectory: true,
					children: [],
				},
			],
		})
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/folder", "archive/folder-renamed"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(14, [
				{
					type: "move",
					fromRel: "docs/folder",
					toRel: "archive/folder-renamed",
					entryKind: "directory",
				},
				{
					type: "scanTree",
					relPrefix: "archive/folder-renamed",
					reason: "directoryMoveWithin",
				},
			]),
		})
		await flushQueue()

		expect(originJournal.resolve).toHaveBeenCalledWith({
			workspacePath: "/ws",
			relPaths: ["docs/folder", "archive/folder-renamed"],
		})
		expect(getState().entryMoved).toHaveBeenCalledWith({
			sourcePath: "/ws/docs/folder",
			destinationDirPath: "/ws/archive",
			newPath: "/ws/archive/folder-renamed",
			isDirectory: true,
		})
		expect(getState().entryMoved.mock.invocationCallOrder[0]).toBeLessThan(
			getState().readWorkspaceEntriesFromPath.mock.invocationCallOrder[0],
		)
		expect(getState().readWorkspaceEntriesFromPath).toHaveBeenCalledWith(
			"/ws/archive/folder-renamed",
		)
		expect(getState().refreshWorkspaceEntries).not.toHaveBeenCalled()
	})

	it("falls back to parent directory refresh for missing to unknown pathState", async () => {
		const { context, setState, getState, originJournal, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/docs",
					name: "docs",
					isDirectory: true,
					children: [],
				},
			],
		})
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/link"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = deps.watcher.subscribe.mock.calls[0]?.[0] as (
			payload: any,
		) => void
		listener({
			workspacePath: "/ws",
			batch: watchBatch(15, [
				{
					type: "pathState",
					relPath: "docs/link",
					before: "missing",
					after: "unknown",
				},
			]),
		})
		await flushQueue()

		expect(getState().entryCreated).not.toHaveBeenCalled()
		expect(getState().readWorkspaceEntriesFromPath).toHaveBeenCalledWith(
			"/ws/docs",
		)
		expect(getState().refreshWorkspaceEntries).not.toHaveBeenCalled()
	})
})
