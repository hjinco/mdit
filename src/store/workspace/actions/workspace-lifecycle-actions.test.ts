import { describe, expect, it, vi } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceLifecycleActions } from "./workspace-lifecycle-actions"

describe("workspace-lifecycle-actions", () => {
	it("openFolderPicker delegates selected path to setWorkspace", async () => {
		const { context, deps, getState } = createWorkspaceActionTestContext()
		deps.openDialog.mockResolvedValue("/ws")
		getState().setWorkspace = vi.fn().mockResolvedValue(undefined)
		const actions = createWorkspaceLifecycleActions(context)

		await actions.openFolderPicker()

		expect(deps.openDialog).toHaveBeenCalledTimes(1)
		expect(getState().setWorkspace).toHaveBeenCalledWith("/ws")
	})

	it("setWorkspace unwatches existing watcher when workspace path changes", async () => {
		const { context, setState, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/old",
			recentWorkspacePaths: ["/old"],
			unwatchFn: unwatch,
		})

		await actions.setWorkspace("/new")

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(getState().workspacePath).toBe("/new")
		expect(getState().unwatchFn).toBeNull()
	})

	it("setWorkspace preserves watcher when workspace path is unchanged", async () => {
		const { context, setState, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/same",
			recentWorkspacePaths: ["/same"],
			unwatchFn: unwatch,
		})

		await actions.setWorkspace("/same")

		expect(unwatch).not.toHaveBeenCalled()
		expect(getState().workspacePath).toBe("/same")
		expect(getState().unwatchFn).toBe(unwatch)
	})

	it("clearWorkspace unwatches existing watcher", async () => {
		const { context, setState, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/old",
			recentWorkspacePaths: ["/old", "/other"],
			unwatchFn: unwatch,
		})

		await actions.clearWorkspace()

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(getState().workspacePath).toBeNull()
		expect(getState().unwatchFn).toBeNull()
	})

	it("initializeWorkspace unwatches existing watcher when workspace path changes", async () => {
		const { context, deps, setState, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/old",
			unwatchFn: unwatch,
		})
		deps.historyRepository.readWorkspaceHistory.mockReturnValue(["/new"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)

		await actions.initializeWorkspace()

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(getState().workspacePath).toBe("/new")
		expect(getState().unwatchFn).toBeNull()
	})

	it("initializeWorkspace preserves watcher when workspace path is unchanged", async () => {
		const { context, deps, setState, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/same",
			unwatchFn: unwatch,
		})
		deps.historyRepository.readWorkspaceHistory.mockReturnValue(["/same"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)

		await actions.initializeWorkspace()

		expect(unwatch).not.toHaveBeenCalled()
		expect(getState().workspacePath).toBe("/same")
		expect(getState().unwatchFn).toBe(unwatch)
	})
})
