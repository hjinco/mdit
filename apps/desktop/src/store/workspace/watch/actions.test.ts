import { beforeEach, describe, expect, it, vi } from "vitest"
import { createWorkspaceActionTestContext } from "../actions/workspace-action-test-helpers"
import { createWorkspaceWatchActions } from "./index"

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
	}

	it("unwatchWorkspace runs unwatch function and clears state", () => {
		const { context, setState, getState, originJournal } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceWatchActions(context)
		const unwatch = vi.fn()
		setState({ unwatchFn: unwatch, workspacePath: "/ws" })

		actions.unwatchWorkspace()

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(originJournal.clearWorkspace).toHaveBeenCalledWith("/ws")
		expect(getState().unwatchFn).toBeNull()
	})

	it("watchWorkspace clears stale unwatchFn when watch start fails", async () => {
		const { context, setState, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceWatchActions(context)
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
		const { context, setState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceWatchActions(context)
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
			createWorkspaceActionTestContext()
		const actions = createWorkspaceWatchActions(context)
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

	it("applies only external paths for mixed non-rescan batches", async () => {
		const { context, setState, originJournal, deps } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceWatchActions(context)
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
			externalRelPaths: ["docs/external.md"],
			localRelPaths: ["docs/local.md"],
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
							relPath: "docs/local.md",
							entryKind: "file",
						},
						{
							type: "created",
							relPath: "docs/external.md",
							entryKind: "file",
						},
					],
					rescan: false,
					emittedAtUnixMs: 1001,
				},
			},
		})
		await flushQueue()

		expect(deps.fileSystemRepository.readDir).toHaveBeenCalledWith("/ws/docs")
	})

	it("always refreshes on rescan batches without origin filtering", async () => {
		const { context, setState, getState, originJournal } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceWatchActions(context)
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

	it("filters hidden paths before origin resolution", async () => {
		const { context, setState, originJournal } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceWatchActions(context)
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
