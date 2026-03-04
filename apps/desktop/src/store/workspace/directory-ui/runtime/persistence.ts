import { areStringArraysEqual } from "@/utils/array-utils"
import type { WorkspaceActionContext } from "../../workspace-action-context"

export const persistExpandedDirectoriesIfChanged = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	previousPaths: string[],
	nextPaths: string[],
	options?: { setState?: boolean },
) => {
	if (areStringArraysEqual(previousPaths, nextPaths)) {
		return false
	}

	if (options?.setState !== false) {
		ctx.set({ expandedDirectories: nextPaths })
	}
	await ctx.deps.settingsRepository.persistExpandedDirectories(
		workspacePath,
		nextPaths,
	)

	return true
}

export const persistPinnedDirectoriesIfChanged = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	previousPaths: string[],
	nextPaths: string[],
	options?: { setState?: boolean },
) => {
	if (areStringArraysEqual(previousPaths, nextPaths)) {
		return false
	}

	if (options?.setState !== false) {
		ctx.set({ pinnedDirectories: nextPaths })
	}
	await ctx.deps.settingsRepository.persistPinnedDirectories(
		workspacePath,
		nextPaths,
	)

	return true
}
