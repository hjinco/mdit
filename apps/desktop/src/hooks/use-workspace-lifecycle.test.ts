import { describe, expect, it, vi } from "vitest"
import { bootstrapWorkspaceLifecycle } from "./use-workspace-lifecycle"

describe("bootstrapWorkspaceLifecycle", () => {
	it("loads the latest recent workspace and enables restore flow", async () => {
		const syncRecentWorkspacePaths = vi
			.fn()
			.mockResolvedValue(["/ws", "/other"])
		const loadWorkspace = vi.fn().mockResolvedValue(undefined)

		await bootstrapWorkspaceLifecycle({
			syncRecentWorkspacePaths,
			loadWorkspace,
		})

		expect(syncRecentWorkspacePaths).toHaveBeenCalledTimes(1)
		expect(loadWorkspace).toHaveBeenCalledWith("/ws", {
			recentWorkspacePaths: ["/ws", "/other"],
			restoreLastOpenedFiles: true,
		})
	})

	it("loads null when there is no recent workspace", async () => {
		const syncRecentWorkspacePaths = vi.fn().mockResolvedValue([])
		const loadWorkspace = vi.fn().mockResolvedValue(undefined)

		await bootstrapWorkspaceLifecycle({
			syncRecentWorkspacePaths,
			loadWorkspace,
		})

		expect(loadWorkspace).toHaveBeenCalledWith(null, {
			recentWorkspacePaths: [],
			restoreLastOpenedFiles: true,
		})
	})

	it("stops before loading when cancelled", async () => {
		const syncRecentWorkspacePaths = vi.fn().mockResolvedValue(["/ws"])
		const loadWorkspace = vi.fn().mockResolvedValue(undefined)

		await bootstrapWorkspaceLifecycle(
			{
				syncRecentWorkspacePaths,
				loadWorkspace,
			},
			() => true,
		)

		expect(loadWorkspace).not.toHaveBeenCalled()
	})
})
