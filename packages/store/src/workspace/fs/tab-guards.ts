import { isPathEqualOrDescendant } from "@mdit/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"
import { waitForUnsavedTabToSettle } from "./helpers/tab-save-helpers"

const readTabState = (ctx: WorkspaceActionContext) => ({
	tabPath: ctx.ports.tab.getActiveTabPath(),
	isSaved: ctx.ports.tab.getIsSaved(),
})

export const waitForActiveTabPathToSettle = async (
	ctx: WorkspaceActionContext,
	targetPath: string,
): Promise<void> => {
	await waitForUnsavedTabToSettle(targetPath, () => readTabState(ctx))
}

export const waitForActiveTabDescendantToSettle = async (
	ctx: WorkspaceActionContext,
	targetPath: string,
): Promise<void> => {
	const activeTabPath = ctx.ports.tab.getActiveTabPath()
	if (!activeTabPath || !isPathEqualOrDescendant(activeTabPath, targetPath)) {
		return
	}

	await waitForUnsavedTabToSettle(activeTabPath, () => readTabState(ctx))
}

export const waitForActiveTabUnderPathsToSettle = async (
	ctx: WorkspaceActionContext,
	paths: string[],
): Promise<void> => {
	const activeTabPath = ctx.ports.tab.getActiveTabPath()
	if (!activeTabPath) {
		return
	}

	if (!paths.some((path) => isPathEqualOrDescendant(activeTabPath, path))) {
		return
	}

	await waitForUnsavedTabToSettle(activeTabPath, () => readTabState(ctx))
}
