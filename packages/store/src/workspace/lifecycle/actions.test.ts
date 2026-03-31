import { describe, expect, it, vi } from "vitest"
import { createActionTestContext } from "../shared/action-test-helpers"
import { createLifecycleActions } from "./actions"

describe("lifecycle-actions", () => {
	const bootstrapWorkspace = async (
		actions: ReturnType<typeof createLifecycleActions>,
	) => {
		const recentWorkspacePaths = await actions.syncRecentWorkspacePaths()
		await actions.loadWorkspace(recentWorkspacePaths[0] ?? null, {
			recentWorkspacePaths,
			restoreLastOpenedFiles: true,
		})
	}

	it("openFolderPicker delegates selected path to setWorkspace", async () => {
		const { context, deps, getState } = createActionTestContext()
		deps.openDialog.mockResolvedValue("/ws")
		getState().setWorkspace = vi.fn().mockResolvedValue(undefined)
		const actions = createLifecycleActions(context)

		await actions.openFolderPicker()

		expect(deps.openDialog).toHaveBeenCalledTimes(1)
		expect(getState().setWorkspace).toHaveBeenCalledWith("/ws")
	})

	it("setWorkspace unwatches existing watcher when workspace path changes", async () => {
		const { context, deps, ports, setState, getState } =
			createActionTestContext()
		const actions = createLifecycleActions(context)
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
		expect(ports.indexing.resetIndexingState).toHaveBeenCalledTimes(1)
		expect(ports.indexing.getIndexingConfig).toHaveBeenCalledWith("/new")
		expect(getState().workspacePath).toBe("/new")
		expect(getState().unwatchFn).toBeNull()
	})

	it("setWorkspace preserves watcher when workspace path is unchanged", async () => {
		const { context, deps, setState, getState } = createActionTestContext()
		const actions = createLifecycleActions(context)
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
		const { context, deps, ports, setState, getState } =
			createActionTestContext()
		const actions = createLifecycleActions(context)
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
		expect(ports.indexing.resetIndexingState).toHaveBeenCalledTimes(1)
		expect(getState().workspacePath).toBeNull()
		expect(getState().unwatchFn).toBeNull()
	})

	it("bootstrapWorkspace unwatches existing watcher when workspace path changes", async () => {
		const { context, deps, ports, setState, getState } =
			createActionTestContext()
		const actions = createLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/old",
			unwatchFn: unwatch,
		})
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/new"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)

		await bootstrapWorkspace(actions)

		expect(unwatch).toHaveBeenCalledTimes(1)
		expect(ports.indexing.resetIndexingState).toHaveBeenCalledTimes(1)
		expect(ports.indexing.getIndexingConfig).toHaveBeenCalledWith("/new")
		expect(getState().workspacePath).toBe("/new")
		expect(getState().unwatchFn).toBeNull()
	})

	it("bootstrapWorkspace does not fail when indexing preload fails", async () => {
		const { context, deps, ports, getState } = createActionTestContext()
		const actions = createLifecycleActions(context)
		const preloadError = new Error("preload failed")

		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/ws"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)
		ports.indexing.getIndexingConfig.mockRejectedValue(preloadError)

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		await bootstrapWorkspace(actions)

		expect(getState().workspacePath).toBe("/ws")
		expect(getState().isTreeLoading).toBe(false)
		expect(ports.indexing.getIndexingConfig).toHaveBeenCalledWith("/ws")
		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to preload indexing config:",
			preloadError,
		)

		errorSpy.mockRestore()
	})

	it("bootstrapWorkspace preserves watcher when workspace path is unchanged", async () => {
		const { context, deps, setState, getState } = createActionTestContext()
		const actions = createLifecycleActions(context)
		const unwatch = vi.fn()
		setState({
			workspacePath: "/same",
			unwatchFn: unwatch,
		})
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/same"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)

		await bootstrapWorkspace(actions)

		expect(unwatch).not.toHaveBeenCalled()
		expect(getState().workspacePath).toBe("/same")
		expect(getState().unwatchFn).toBe(unwatch)
	})

	it("bootstrapWorkspace removes missing workspace paths from vault history", async () => {
		const { context, deps, getState } = createActionTestContext()
		const actions = createLifecycleActions(context)
		deps.historyRepository.listWorkspacePaths.mockResolvedValue([
			"/valid",
			"/missing",
		])
		deps.fileSystemRepository.isExistingDirectory.mockImplementation(
			async (path: string) => path === "/valid",
		)

		await bootstrapWorkspace(actions)

		expect(deps.historyRepository.removeWorkspace).toHaveBeenCalledWith(
			"/missing",
		)
		expect(getState().recentWorkspacePaths).toEqual(["/valid"])
	})

	it("syncRecentWorkspacePaths updates state and returns valid paths", async () => {
		const { context, deps, getState } = createActionTestContext()
		const actions = createLifecycleActions(context)
		deps.historyRepository.listWorkspacePaths.mockResolvedValue([
			"/valid",
			"/missing",
		])
		deps.fileSystemRepository.isExistingDirectory.mockImplementation(
			async (path: string) => path === "/valid",
		)

		const paths = await actions.syncRecentWorkspacePaths()

		expect(paths).toEqual(["/valid"])
		expect(getState().recentWorkspacePaths).toEqual(["/valid"])
		expect(deps.historyRepository.removeWorkspace).toHaveBeenCalledWith(
			"/missing",
		)
	})

	it("loadWorkspace uses provided recent paths and restores tabs when requested", async () => {
		const { context, deps, ports, getState } = createActionTestContext()
		const actions = createLifecycleActions(context)

		deps.fileSystemRepository.readDir.mockImplementation(
			async (path: string) => {
				if (path === "/ws") {
					return [{ name: "a.md", isDirectory: false }]
				}
				return []
			},
		)
		deps.settingsRepository.loadSettings.mockResolvedValue({
			lastOpenedFilePaths: ["a.md"],
		})
		deps.fileSystemRepository.exists.mockResolvedValue(true)

		await actions.loadWorkspace("/ws", {
			recentWorkspacePaths: ["/ws", "/other"],
			restoreLastOpenedFiles: true,
		})

		expect(getState().workspacePath).toBe("/ws")
		expect(getState().recentWorkspacePaths).toEqual(["/ws", "/other"])
		expect(ports.tab.hydrateFromOpenedFiles).toHaveBeenCalledWith(["/ws/a.md"])
	})

	it("setWorkspace removes missing path and refreshes workspace list", async () => {
		const { context, deps, getState } = createActionTestContext()
		const actions = createLifecycleActions(context)
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(false)
		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/other"])

		await actions.setWorkspace("/missing")

		expect(deps.historyRepository.removeWorkspace).toHaveBeenCalledWith(
			"/missing",
		)
		expect(getState().recentWorkspacePaths).toEqual(["/other"])
	})

	it("removeWorkspaceFromHistory updates recent workspace list", async () => {
		const { context, deps, setState, getState } = createActionTestContext()
		const actions = createLifecycleActions(context)
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
			createActionTestContext()
		const actions = createLifecycleActions(context)
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

	it("bootstrapWorkspace sanitizes invalid expanded/pinned directories from settings", async () => {
		const { context, deps, getState } = createActionTestContext()
		const actions = createLifecycleActions(context)

		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/ws"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)
		deps.fileSystemRepository.readDir.mockImplementation(
			async (path: string) => {
				if (path === "/ws") {
					return [{ name: "docs", isDirectory: true }]
				}
				if (path === "/ws/docs") {
					return []
				}
				return []
			},
		)
		deps.settingsRepository.getPinnedDirectoriesFromSettings.mockReturnValue([
			"/ws/docs",
			"/outside",
			"/ws/missing",
		])
		deps.settingsRepository.getExpandedDirectoriesFromSettings.mockReturnValue([
			"/ws/docs",
			"/ws/missing",
		])

		await bootstrapWorkspace(actions)

		expect(getState().pinnedDirectories).toEqual(["/ws/docs"])
		expect(getState().expandedDirectories).toEqual(["/ws/docs"])
		expect(
			deps.settingsRepository.persistPinnedDirectories,
		).toHaveBeenCalledWith("/ws", ["/ws/docs"])
		expect(
			deps.settingsRepository.persistExpandedDirectories,
		).toHaveBeenCalledWith("/ws", ["/ws/docs"])
	})

	it("bootstrapWorkspace restores opened file history in order", async () => {
		const { context, deps, ports } = createActionTestContext()
		const actions = createLifecycleActions(context)

		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/ws"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)
		deps.settingsRepository.loadSettings.mockResolvedValue({
			lastOpenedFilePaths: ["a.md", "b.md", "c.md"],
		})
		deps.fileSystemRepository.exists.mockImplementation(async (path: string) =>
			["/ws/a.md", "/ws/b.md", "/ws/c.md"].includes(path),
		)

		await bootstrapWorkspace(actions)

		expect(ports.tab.hydrateFromOpenedFiles).toHaveBeenCalledTimes(1)
		expect(ports.tab.hydrateFromOpenedFiles).toHaveBeenCalledWith([
			"/ws/a.md",
			"/ws/b.md",
			"/ws/c.md",
		])
		expect(ports.tab.openTab).not.toHaveBeenCalled()
	})

	it("bootstrapWorkspace restores only valid opened file paths", async () => {
		const { context, deps, ports } = createActionTestContext()
		const actions = createLifecycleActions(context)

		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/ws"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)
		deps.settingsRepository.loadSettings.mockResolvedValue({
			lastOpenedFilePaths: [
				"valid-a.md",
				"../outside.md",
				"missing.md",
				"valid-b.md",
			],
		})
		deps.fileSystemRepository.exists.mockImplementation(async (path: string) =>
			["/ws/valid-a.md", "/ws/valid-b.md", "/outside.md"].includes(path),
		)

		await bootstrapWorkspace(actions)

		expect(ports.tab.hydrateFromOpenedFiles).toHaveBeenCalledTimes(1)
		expect(ports.tab.hydrateFromOpenedFiles).toHaveBeenCalledWith([
			"/ws/valid-a.md",
			"/ws/valid-b.md",
		])
		expect(ports.tab.openTab).not.toHaveBeenCalled()
	})

	it("bootstrapWorkspace restores at most five opened file paths", async () => {
		const { context, deps, ports } = createActionTestContext()
		const actions = createLifecycleActions(context)

		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/ws"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)
		deps.settingsRepository.loadSettings.mockResolvedValue({
			lastOpenedFilePaths: ["1.md", "2.md", "3.md", "4.md", "5.md", "6.md"],
		})
		deps.fileSystemRepository.exists.mockResolvedValue(true)

		await bootstrapWorkspace(actions)

		expect(ports.tab.hydrateFromOpenedFiles).toHaveBeenCalledTimes(1)
		expect(ports.tab.hydrateFromOpenedFiles).toHaveBeenCalledWith([
			"/ws/2.md",
			"/ws/3.md",
			"/ws/4.md",
			"/ws/5.md",
			"/ws/6.md",
		])
		expect(ports.tab.openTab).not.toHaveBeenCalled()
	})

	it("bootstrapWorkspace skips tab restore when hydration fails", async () => {
		const { context, deps, ports } = createActionTestContext()
		const actions = createLifecycleActions(context)

		deps.historyRepository.listWorkspacePaths.mockResolvedValue(["/ws"])
		deps.fileSystemRepository.isExistingDirectory.mockResolvedValue(true)
		deps.settingsRepository.loadSettings.mockResolvedValue({
			lastOpenedFilePaths: ["a.md"],
		})
		deps.fileSystemRepository.exists.mockResolvedValue(true)
		ports.tab.hydrateFromOpenedFiles.mockResolvedValue(false)

		await bootstrapWorkspace(actions)

		expect(ports.tab.hydrateFromOpenedFiles).toHaveBeenCalledWith(["/ws/a.md"])
		expect(ports.tab.openTab).not.toHaveBeenCalled()
	})
})
