import { describe, expect, it } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceTreeActions } from "./workspace-tree-actions"

describe("workspace-tree-actions", () => {
	it("updateEntries refreshes collection entries through ports", () => {
		const { context, ports, getState } = createWorkspaceActionTestContext()
		const actions = createWorkspaceTreeActions(context)

		actions.updateEntries([
			{ path: "/ws/a.md", name: "a.md", isDirectory: false },
		])

		expect(getState().entries).toHaveLength(1)
		expect(ports.collection.refreshCollectionEntries).toHaveBeenCalledTimes(1)
	})

	it("setExpandedDirectories persists when changed", async () => {
		const { context, deps, setState, getState } =
			createWorkspaceActionTestContext()
		setState({ workspacePath: "/ws", expandedDirectories: ["/ws"] })
		const actions = createWorkspaceTreeActions(context)

		await actions.setExpandedDirectories((paths) => [...paths, "/ws/docs"])

		expect(getState().expandedDirectories).toEqual(["/ws", "/ws/docs"])
		expect(
			deps.settingsRepository.persistExpandedDirectories,
		).toHaveBeenCalledWith("/ws", ["/ws", "/ws/docs"])
	})
})
