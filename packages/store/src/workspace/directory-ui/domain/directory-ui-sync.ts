import { areStringArraysEqual } from "@mdit/utils/array-utils"
import type { WorkspaceEntry } from "../../workspace-state"
import { syncExpandedDirectoriesWithEntries } from "./expanded-directories-helpers"
import {
	filterPinsForWorkspace,
	filterPinsWithEntries,
} from "./pinned-directories-helpers"

export type DirectoryUiSyncResult = {
	nextExpanded: string[]
	nextPinned: string[]
	expandedChanged: boolean
	pinnedChanged: boolean
}

export const deriveDirectoryUiSyncResult = (input: {
	workspacePath: string
	previousExpanded: string[]
	previousPinned: string[]
	nextEntries: WorkspaceEntry[]
}): DirectoryUiSyncResult => {
	const nextExpanded = syncExpandedDirectoriesWithEntries(
		input.previousExpanded,
		input.nextEntries,
	)
	const nextPinned = filterPinsWithEntries(
		filterPinsForWorkspace(input.previousPinned, input.workspacePath),
		input.nextEntries,
		input.workspacePath,
	)

	const expandedChanged = !areStringArraysEqual(
		input.previousExpanded,
		nextExpanded,
	)
	const pinnedChanged = !areStringArraysEqual(input.previousPinned, nextPinned)

	return {
		nextExpanded,
		nextPinned,
		expandedChanged,
		pinnedChanged,
	}
}
