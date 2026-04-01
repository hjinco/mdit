import type { OpenTabSnapshot } from "../tab/tab-slice"
import type { WorkspaceActionContext } from "./workspace-action-context"

export const getOpenTabSnapshotsForWorkspacePolicy = (
	ctx: WorkspaceActionContext,
): OpenTabSnapshot[] => ctx.ports.tab.getOpenTabSnapshots()

export const getPrimaryOpenTabPathFromSnapshotsForWorkspacePolicy = (
	snapshots: readonly OpenTabSnapshot[],
): string | null => snapshots[0]?.path ?? null

export const getPrimaryOpenTabPathForWorkspacePolicy = (
	ctx: WorkspaceActionContext,
): string | null => {
	const snapshots = getOpenTabSnapshotsForWorkspacePolicy(ctx)
	return getPrimaryOpenTabPathFromSnapshotsForWorkspacePolicy(snapshots)
}
