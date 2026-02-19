import { describe, expect, it } from "vitest"
import { createWorkspaceActionTestContext } from "./workspace-action-test-helpers"
import { createWorkspaceEntryActions } from "./workspace-entry-actions"

describe("workspace-entry-actions", () => {
	it("entryRenamed updates tab/history via ports and notifies collection", async () => {
		const { context, ports, setState } = createWorkspaceActionTestContext()
		setState({
			workspacePath: "/ws",
			entries: [{ path: "/ws/folder", name: "folder", isDirectory: true }],
			expandedDirectories: ["/ws/folder"],
			pinnedDirectories: ["/ws/folder"],
		})

		const actions = createWorkspaceEntryActions(context)

		await actions.entryRenamed({
			oldPath: "/ws/folder",
			newPath: "/ws/renamed",
			isDirectory: true,
			newName: "renamed",
		})

		expect(ports.tab.renameTab).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
		)
		expect(ports.tab.updateHistoryPath).toHaveBeenCalledWith(
			"/ws/folder",
			"/ws/renamed",
		)
		expect(ports.collection.onEntryRenamed).toHaveBeenCalledWith({
			oldPath: "/ws/folder",
			newPath: "/ws/renamed",
			isDirectory: true,
			newName: "renamed",
		})
	})
})
