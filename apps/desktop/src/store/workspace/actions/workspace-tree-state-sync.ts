import { areStringArraysEqual } from "@/utils/array-utils"
import { syncExpandedDirectoriesWithEntries } from "../helpers/expanded-directories-helpers"
import {
	filterPinsForWorkspace,
	filterPinsWithEntries,
} from "../helpers/pinned-directories-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"

type SyncWorkspaceTreeStateOptions = {
	persistExpandedWhenUnchanged?: boolean
}

export const syncWorkspaceTreeStateWithEntries = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	nextEntries: WorkspaceEntry[],
	options?: SyncWorkspaceTreeStateOptions,
) => {
	const state = ctx.get()
	const previousExpanded = state.expandedDirectories
	const previousPinned = state.pinnedDirectories

	const nextExpanded = syncExpandedDirectoriesWithEntries(
		previousExpanded,
		nextEntries,
	)
	const nextPinned = filterPinsWithEntries(
		filterPinsForWorkspace(previousPinned, workspacePath),
		nextEntries,
		workspacePath,
	)

	const expandedChanged = !areStringArraysEqual(previousExpanded, nextExpanded)
	const pinnedChanged = !areStringArraysEqual(previousPinned, nextPinned)

	state.updateEntries(nextEntries)

	if (expandedChanged || pinnedChanged) {
		ctx.set({
			...(expandedChanged ? { expandedDirectories: nextExpanded } : {}),
			...(pinnedChanged ? { pinnedDirectories: nextPinned } : {}),
		})
	}

	if (expandedChanged || options?.persistExpandedWhenUnchanged) {
		await ctx.deps.settingsRepository.persistExpandedDirectories(
			workspacePath,
			nextExpanded,
		)
	}

	if (pinnedChanged) {
		await ctx.deps.settingsRepository.persistPinnedDirectories(
			workspacePath,
			nextPinned,
		)
	}
}
