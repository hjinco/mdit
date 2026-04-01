import { isPathEqualOrDescendant } from "@mdit/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"
import { waitForUnsavedTabToSettle } from "./helpers/tab-save-helpers"

const readOpenTabSnapshots = (ctx: WorkspaceActionContext) =>
	ctx.ports.tab.getOpenTabSnapshots()

const readTabState = (ctx: WorkspaceActionContext, path: string) => {
	const matchingTab = readOpenTabSnapshots(ctx).find((tab) => tab.path === path)
	return {
		tabPath: matchingTab?.path ?? null,
		isSaved: matchingTab?.isSaved ?? true,
	}
}

export const waitForActiveTabPathToSettle = async (
	ctx: WorkspaceActionContext,
	targetPath: string,
): Promise<void> => {
	await waitForUnsavedTabToSettle(targetPath, () =>
		readTabState(ctx, targetPath),
	)
}

export const waitForActiveTabDescendantToSettle = async (
	ctx: WorkspaceActionContext,
	targetPath: string,
): Promise<void> => {
	const matchingTab = readOpenTabSnapshots(ctx).find((tab) =>
		isPathEqualOrDescendant(tab.path, targetPath),
	)
	if (!matchingTab) {
		return
	}

	await waitForUnsavedTabToSettle(matchingTab.path, () =>
		readTabState(ctx, matchingTab.path),
	)
}

export const waitForActiveTabUnderPathsToSettle = async (
	ctx: WorkspaceActionContext,
	paths: string[],
): Promise<void> => {
	const matchingTab = readOpenTabSnapshots(ctx).find((tab) =>
		paths.some((path) => isPathEqualOrDescendant(tab.path, path)),
	)
	if (!matchingTab) {
		return
	}

	await waitForUnsavedTabToSettle(matchingTab.path, () =>
		readTabState(ctx, matchingTab.path),
	)
}
