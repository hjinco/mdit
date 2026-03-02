import { beforeEach, describe, expect, it, vi } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import {
	collectRefreshDirectoryPaths,
	createWorkspaceWatchActions,
	replaceDirectoryChildren,
} from "./workspace-watch-actions"

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

describe("workspace-watch-actions", () => {
	beforeEach(() => {
		invokeMock.mockReset()
		getCurrentWindowMock.mockReset()
		listenMock.mockReset()
		invokeMock.mockResolvedValue(undefined)
		listenMock.mockReturnValue(Promise.resolve(vi.fn()))
		getCurrentWindowMock.mockReturnValue({ listen: listenMock })
	})

	it("unwatchWorkspace runs unwatch function and clears state", () => {
		const { context, setState, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceWatchActions(context)
		const unwatch = vi.fn()
		setState({ unwatchFn: unwatch })

		actions.unwatchWorkspace()

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(getState().unwatchFn).toBeNull()
	})

	it("collectRefreshDirectoryPaths collapses to top-most parent directories", () => {
		const paths = collectRefreshDirectoryPaths("/ws", [
			"docs/a.md",
			"docs/sub/b.md",
			"archive/c.md",
		])

		expect(paths).toEqual(["/ws/docs", "/ws/archive"])
	})

	it("collectRefreshDirectoryPaths treats sibling prefixes as distinct directories", () => {
		const paths = collectRefreshDirectoryPaths("/ws", [
			"a/file.md",
			"a/sub/child.md",
			"a-archive/other.md",
		])

		expect(paths).toEqual(["/ws/a", "/ws/a-archive"])
	})

	it("replaceDirectoryChildren updates only target directory subtree", () => {
		const entries = [
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
				path: "/ws/keep.md",
				name: "keep.md",
				isDirectory: false,
			},
		]

		const nextChildren = [
			{
				path: "/ws/docs/new.md",
				name: "new.md",
				isDirectory: false,
			},
		]

		const updated = replaceDirectoryChildren(
			entries,
			"/ws",
			"/ws/docs",
			nextChildren,
		)

		expect(updated[0]?.children).toEqual(nextChildren)
		expect(updated[1]).toEqual(entries[1])
	})

	it("replaceDirectoryChildren swaps root entries when workspace root is targeted", () => {
		const entries = [
			{
				path: "/ws/old.md",
				name: "old.md",
				isDirectory: false,
			},
		]
		const nextRootEntries = [
			{
				path: "/ws/new.md",
				name: "new.md",
				isDirectory: false,
			},
		]

		const updated = replaceDirectoryChildren(
			entries,
			"/ws",
			"/ws",
			nextRootEntries,
		)

		expect(updated).toEqual(nextRootEntries)
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
})
