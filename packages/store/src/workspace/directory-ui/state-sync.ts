import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"
import { deriveDirectoryUiSyncResult } from "./domain/directory-ui-sync"
import {
	persistExpandedDirectoriesIfChanged,
	persistPinnedDirectoriesIfChanged,
} from "./runtime/persistence"

export type SyncWorkspaceDirectoryUiStateOptions = {
	persistExpandedWhenUnchanged?: boolean
	previousExpandedDirectories?: string[]
	previousPinnedDirectories?: string[]
}

export const syncWorkspaceDirectoryUiStateWithEntries = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	nextEntries: WorkspaceEntry[],
	options?: SyncWorkspaceDirectoryUiStateOptions,
) => {
	const state = ctx.get()
	const previousExpanded =
		options?.previousExpandedDirectories ?? state.expandedDirectories
	const previousPinned =
		options?.previousPinnedDirectories ?? state.pinnedDirectories
	const syncResult = deriveDirectoryUiSyncResult({
		workspacePath,
		previousExpanded,
		previousPinned,
		nextEntries,
	})

	state.updateEntries(nextEntries)

	if (syncResult.expandedChanged) {
		await persistExpandedDirectoriesIfChanged(
			ctx,
			workspacePath,
			previousExpanded,
			syncResult.nextExpanded,
		)
	} else if (options?.previousExpandedDirectories !== undefined) {
		ctx.set({ expandedDirectories: syncResult.nextExpanded })
	}

	if (options?.persistExpandedWhenUnchanged) {
		await ctx.deps.settingsRepository.persistExpandedDirectories(
			workspacePath,
			syncResult.nextExpanded,
		)
	}

	if (syncResult.pinnedChanged) {
		await persistPinnedDirectoriesIfChanged(
			ctx,
			workspacePath,
			previousPinned,
			syncResult.nextPinned,
		)
	} else if (options?.previousPinnedDirectories !== undefined) {
		ctx.set({ pinnedDirectories: syncResult.nextPinned })
	}
}
