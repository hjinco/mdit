import { isPathEqualOrDescendant } from "@mdit/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"
import { waitForUnsavedTabToSettle } from "./helpers/tab-save-helpers"

const readOpenTabSnapshots = (ctx: WorkspaceActionContext) =>
	ctx.ports.tab.getOpenTabSnapshots()

const readMatchingTabPaths = (
	ctx: WorkspaceActionContext,
	predicate: (path: string) => boolean,
): string[] =>
	readOpenTabSnapshots(ctx)
		.filter((tab) => predicate(tab.path))
		.map((tab) => tab.path)

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
	const matchingTabPaths = readMatchingTabPaths(ctx, (path) =>
		isPathEqualOrDescendant(path, targetPath),
	)
	if (matchingTabPaths.length === 0) {
		return
	}

	for (const matchingTabPath of matchingTabPaths) {
		await waitForUnsavedTabToSettle(matchingTabPath, () =>
			readTabState(ctx, matchingTabPath),
		)
	}
}

export const waitForActiveTabUnderPathsToSettle = async (
	ctx: WorkspaceActionContext,
	paths: string[],
): Promise<void> => {
	const matchingTabPaths = readMatchingTabPaths(ctx, (tabPath) =>
		paths.some((path) => isPathEqualOrDescendant(tabPath, path)),
	)
	if (matchingTabPaths.length === 0) {
		return
	}

	for (const matchingTabPath of matchingTabPaths) {
		await waitForUnsavedTabToSettle(matchingTabPath, () =>
			readTabState(ctx, matchingTabPath),
		)
	}
}
