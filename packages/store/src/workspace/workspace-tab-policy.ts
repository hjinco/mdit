import type { OpenTabSnapshot } from "../tab/tab-slice"
import type { WorkspaceActionContext } from "./workspace-action-context"

export const getOpenTabSnapshotsForWorkspacePolicy = (
	ctx: WorkspaceActionContext,
): OpenTabSnapshot[] => ctx.ports.tab.getOpenTabSnapshots()

export const getActiveTabPathForWorkspacePolicy = (
	ctx: WorkspaceActionContext,
): string | null => ctx.ports.tab.getActiveTabPath()
