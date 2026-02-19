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
		const { context, deps, setState, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/old",
			recentWorkspacePaths: ["/old"],
			unwatchFn: unwatch,
		})
		deps.historyRepository.listWorkspacePaths.mockResolvedValue([
			"/new",
			"/old",
		])

		await actions.setWorkspace("/new")

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(deps.historyRepository.touchWorkspace).toHaveBeenCalledWith("/new")
		expect(deps.historyRepository.listWorkspacePaths).toHaveBeenCalled()
		expect(getState().workspacePath).toBe("/new")
		expect(getState().unwatchFn).toBeNull()
	})

	it("setWorkspace preserves watcher when workspace path is unchanged", async () => {
		const { context, deps, setState, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/same",
			recentWorkspacePaths: ["/same"],
			unwatchFn: unwatch,
		})
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/same"])

		await actions.setWorkspace("/same")

		expect(unwatch).not.toHaveBeenCalled()
		expect(deps.historyRepository.touchWorkspace).toHaveBeenCalledWith("/same")
		expect(getState().workspacePath).toBe("/same")
		expect(getState().unwatchFn).toBe(unwatch)
	})

	it("clearWorkspace unwatches existing watcher", async () => {
		const { context, deps, setState, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/old",
			recentWorkspacePaths: ["/old", "/other"],
			unwatchFn: unwatch,
		})
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/other"])

		await actions.clearWorkspace()

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(deps.historyRepository.removeWorkspace).toHaveBeenCalledWith("/old")
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
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/new"])
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
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/same"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)

		await actions.initializeWorkspace()

		expect(unwatch).not.toHaveBeenCalled()
		expect(getState().workspacePath).toBe("/same")
		expect(getState().unwatchFn).toBe(unwatch)
	})

	it("initializeWorkspace removes missing workspace paths from vault history", async () => {
		const { context, deps, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		deps.historyRepository.listWorkspacePaths.mockResolvedValue([
			"/valid",
			"/missing",
		])
		deps.fileSystemRepository.isExistingDirectory.mockImplementation(
			async (path: string) => path === "/valid",
		)

		await actions.initializeWorkspace()

		expect(deps.historyRepository.removeWorkspace).toHaveBeenCalledWith(
			"/missing",
		)
		expect(getState().recentWorkspacePaths).toEqual(["/valid"])
	})

	it("setWorkspace removes missing path and refreshes workspace list", async () => {
		const { context, deps, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(false)
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/other"])

		await actions.setWorkspace("/missing")

		expect(deps.historyRepository.removeWorkspace).toHaveBeenCalledWith(
			"/missing",
		)
		expect(getState().recentWorkspacePaths).toEqual(["/other"])
	})

	it("removeWorkspaceFromHistory updates recent workspace list", async () => {
		const { context, deps, setState, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		setState({
			workspacePath: "/current",
			recentWorkspacePaths: ["/current", "/other"],
		})
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/current"])

		await actions.removeWorkspaceFromHistory("/other")

		expect(deps.historyRepository.removeWorkspace).toHaveBeenCalledWith(
			"/other",
		)
		expect(getState().workspacePath).toBe("/current")
		expect(getState().recentWorkspacePaths).toEqual(["/current"])
	})

	it("removeWorkspaceFromHistory keeps current workspace open", async () => {
		const { context, deps, ports, setState, getState } =
			createWorkspaceActionTestContext()
		const actions = createWorkspaceLifecycleActions(context)
		setState({
			workspacePath: "/current",
			recentWorkspacePaths: ["/current", "/other"],
		})
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/other"])

		await actions.removeWorkspaceFromHistory("/current")

		expect(deps.historyRepository.removeWorkspace).toHaveBeenCalledWith(
			"/current",
		)
		expect(getState().workspacePath).toBe("/current")
		expect(getState().recentWorkspacePaths).toEqual(["/other"])
		expect(ports.tab.closeTab).not.toHaveBeenCalled()
		expect(ports.tab.clearHistory).not.toHaveBeenCalled()
	})
})
