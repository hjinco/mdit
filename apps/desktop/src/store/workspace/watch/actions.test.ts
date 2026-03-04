import { beforeEach, describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createWatchActions } from "./index"

const { invokeMock, getCurrentWindowMock, listenMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	getCurrentWindowMock: vi.fn(),
	listenMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
	invoke: invokeMock,
}))

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: getCurrentWindowMock,
}))

describe("watch/actions", () => {
	beforeEach(() => {
		invokeMock.mockReset()
		getCurrentWindowMock.mockReset()
		listenMock.mockReset()
		invokeMock.mockResolvedValue(undefined)
		listenMock.mockReturnValue(Promise.resolve(vi.fn()))
		getCurrentWindowMock.mockReturnValue({ listen: listenMock })
	})

	const flushQueue = async () => {
		await Promise.resolve()
		await Promise.resolve()
		await new Promise((resolve) => setTimeout(resolve, 0))
	}

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
		const { context, setState, getState } = createActionTestContext()
		const actions = createWatchActions(context)
		const previousUnwatch = vi.fn()
		const unlisten = vi.fn()

		setState({
			workspacePath: "/ws",
			unwatchFn: previousUnwatch,
		})

		listenMock.mockReturnValue(Promise.resolve(unlisten))
		getCurrentWindowMock.mockReturnValue({ listen: listenMock })
		invokeMock.mockRejectedValueOnce(new Error("start failed"))

		await actions.watchWorkspace()
		await Promise.resolve()

		expect(previousUnwatch).toHaveBeenCalledTimes(1)
		expect(getState().unwatchFn).toBeNull()
		expect(unlisten).toHaveBeenCalledTimes(1)
	})

	it("watchWorkspace waits for previous async unwatch cleanup before start", async () => {
		const { context, setState } = createActionTestContext()
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
		expect(listenMock).not.toHaveBeenCalled()
		expect(invokeMock).not.toHaveBeenCalled()

		resolveCleanup()
		await watchPromise

		expect(invokeMock).toHaveBeenCalledWith("start_vault_watch_command", {
			workspacePath: "/ws",
		})
	})

	it("ignores non-rescan local-only batches", async () => {
		const { context, setState, getState, originJournal, deps } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: [],
			localRelPaths: ["docs/local.md"],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 1,
					changes: [
						{
							type: "created",
							relPath: "docs/local.md",
							entryKind: "file",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1000,
				},
			},
		})
		await flushQueue()

		expect(originJournal.resolve).toHaveBeenCalledWith({
			workspacePath: "/ws",
			relPaths: ["docs/local.md"],
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

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
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
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 2,
					changes: [
						{
							type: "created",
							relPath: "docs/created.md",
							entryKind: "file",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1001,
				},
			},
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

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
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
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 3,
					changes: [
						{
							type: "created",
							relPath: "docs/new-dir",
							entryKind: "directory",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1002,
				},
			},
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
		const { context, setState, originJournal, getState } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/deleted.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 4,
					changes: [
						{
							type: "deleted",
							relPath: "docs/deleted.md",
							entryKind: "file",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1003,
				},
			},
		})
		await flushQueue()

		expect(getState().entriesDeleted).toHaveBeenCalledWith({
			paths: ["/ws/docs/deleted.md"],
		})
	})

	it("applies deleted directories via entriesDeleted", async () => {
		const { context, setState, originJournal, getState } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 5,
					changes: [
						{
							type: "deleted",
							relPath: "docs",
							entryKind: "directory",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1004,
				},
			},
		})
		await flushQueue()

		expect(getState().entriesDeleted).toHaveBeenCalledWith({
			paths: ["/ws/docs"],
		})
	})

	it("maps same-parent move to entryRenamed", async () => {
		const { context, setState, originJournal, getState } =
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

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/old.md", "docs/new.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 6,
					changes: [
						{
							type: "moved",
							fromRel: "docs/old.md",
							toRel: "docs/new.md",
							entryKind: "file",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1005,
				},
			},
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
		const { context, setState, originJournal, getState } =
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

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/old.md", "archive/renamed.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 7,
					changes: [
						{
							type: "moved",
							fromRel: "docs/old.md",
							toRel: "archive/renamed.md",
							entryKind: "file",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1006,
				},
			},
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
		const { context, setState, originJournal, getState } =
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

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/folder", "archive/folder-renamed"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 8,
					changes: [
						{
							type: "moved",
							fromRel: "docs/folder",
							toRel: "archive/folder-renamed",
							entryKind: "directory",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1007,
				},
			},
		})
		await flushQueue()

		expect(getState().entryMoved).toHaveBeenCalledWith({
			sourcePath: "/ws/docs/folder",
			destinationDirPath: "/ws/archive",
			newPath: "/ws/archive/folder-renamed",
			isDirectory: true,
		})
	})

	it("updates modified file metadata incrementally", async () => {
		const { context, setState, originJournal, getState } =
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
							path: "/ws/docs/a.md",
							name: "a.md",
							isDirectory: false,
						},
					],
				},
			],
		})

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/a.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 9,
					changes: [
						{
							type: "modified",
							relPath: "docs/a.md",
							entryKind: "file",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1008,
				},
			},
		})
		await flushQueue()

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

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 10,
					changes: [
						{
							type: "modified",
							relPath: "docs",
							entryKind: "directory",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1009,
				},
			},
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

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs/missing.md", "archive/missing.md"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 11,
					changes: [
						{
							type: "moved",
							fromRel: "docs/missing.md",
							toRel: "archive/missing.md",
							entryKind: "file",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1010,
				},
			},
		})
		await flushQueue()

		expect(deps.fileSystemRepository.readDir).toHaveBeenCalledWith("/ws/docs")
		expect(deps.fileSystemRepository.readDir).toHaveBeenCalledWith(
			"/ws/archive",
		)
	})

	it("always refreshes on rescan batches without origin filtering", async () => {
		const { context, setState, getState, originJournal } =
			createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 3,
					changes: [],
					rescan: true,
					emittedAtUnixMs: 1002,
				},
			},
		})
		await flushQueue()

		expect(originJournal.resolve).not.toHaveBeenCalled()
		expect(getState().refreshWorkspaceEntries).toHaveBeenCalledTimes(1)
	})

	it("falls back to full refresh when partial fallback refresh fails", async () => {
		const { context, setState, originJournal, getState } =
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

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: ["docs"],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 12,
					changes: [
						{
							type: "modified",
							relPath: "docs",
							entryKind: "directory",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1011,
				},
			},
		})
		await flushQueue()

		expect(getState().refreshWorkspaceEntries).toHaveBeenCalledTimes(1)
	})

	it("filters hidden paths before origin resolution", async () => {
		const { context, setState, originJournal } = createActionTestContext()
		const actions = createWatchActions(context)
		setState({ workspacePath: "/ws" })

		listenMock.mockImplementation(() => Promise.resolve(vi.fn()))
		originJournal.resolve.mockReturnValue({
			externalRelPaths: [],
			localRelPaths: [],
		})

		await actions.watchWorkspace()
		const listener = listenMock.mock.calls[0]?.[1] as (event: any) => void
		listener({
			payload: {
				workspacePath: "/ws",
				batch: {
					seq: 4,
					changes: [
						{
							type: "created",
							relPath: "visible.md",
							entryKind: "file",
						},
						{
							type: "created",
							relPath: ".hidden/secret.md",
							entryKind: "file",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1003,
				},
			},
		})
		await flushQueue()

		expect(originJournal.resolve).toHaveBeenCalledWith({
			workspacePath: "/ws",
			relPaths: ["visible.md"],
		})
	})
})
