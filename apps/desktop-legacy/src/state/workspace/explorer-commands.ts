import { areStringArraysEqual } from "@mdit/utils/array-utils"
import {
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@mdit/utils/path-utils"
import type { createState } from "../create-state"
import type { createWorkspaceTreeProjection } from "./tree-projection"
import type {
	WorkspaceEntry,
	WorkspaceEntrySelection,
	WorkspaceState,
} from "./types"

export function createWorkspaceExplorerCommands({
	state,
	getEntryByPath,
	persistDirectoryUi,
}: {
	state: ReturnType<typeof createState<WorkspaceState>>
	getEntryByPath: (path: string) => WorkspaceEntry | null
	persistDirectoryUi: ReturnType<
		typeof createWorkspaceTreeProjection
	>["persistDirectoryUi"]
}) {
	const { getSnapshot } = state

	const setEntrySelection = ({
		selectedIds,
		anchorId,
	}: WorkspaceEntrySelection) => {
		state.update({
			selectedEntryPaths: selectedIds,
			selectionAnchorPath: anchorId,
		})
	}

	const updateEntryLocks = (paths: string[], locked: boolean) => {
		if (paths.length === 0) {
			return
		}
		state.update(({ aiLockedEntryPaths }) => {
			const next = new Set(aiLockedEntryPaths)
			for (const path of paths) {
				const normalized = normalizePathSeparators(path)
				if (locked) {
					next.add(normalized)
				} else {
					next.delete(normalized)
				}
			}
			return { aiLockedEntryPaths: next }
		})
	}

	const setExpandedDirectories = async (paths: Set<string> | string[]) => {
		const previous = getSnapshot()
		const { workspacePath, pinnedDirectories, expandedDirectories } = previous
		if (!workspacePath) {
			return
		}
		const next = { expandedDirectories: [...new Set(paths)], pinnedDirectories }
		if (!areStringArraysEqual(expandedDirectories, next.expandedDirectories)) {
			state.update(next)
			await persistDirectoryUi(workspacePath, previous, next)
		}
	}

	const updatePinnedDirectories = async (path: string, pinned: boolean) => {
		const previous = getSnapshot()
		const { workspacePath, pinnedDirectories, expandedDirectories } = previous
		const normalized = normalizePathSeparators(path)
		if (
			!workspacePath ||
			(pinned &&
				(!isPathEqualOrDescendant(normalized, workspacePath) ||
					(normalized !== normalizePathSeparators(workspacePath) &&
						!getEntryByPath(normalized)?.isDirectory)))
		) {
			return
		}
		const next = {
			expandedDirectories,
			pinnedDirectories: pinned
				? [...new Set([...pinnedDirectories, normalized])]
				: pinnedDirectories.filter((value) => value !== normalized),
		}
		if (!areStringArraysEqual(pinnedDirectories, next.pinnedDirectories)) {
			state.update(next)
			await persistDirectoryUi(workspacePath, previous, next)
		}
	}

	const setCurrentCollectionPath = (
		value: string | null | ((previous: string | null) => string | null),
	) => {
		state.update(({ currentCollectionPath, lastCollectionPath }) => {
			const path =
				typeof value === "function" ? value(currentCollectionPath) : value
			return {
				currentCollectionPath: path,
				lastCollectionPath: path ?? lastCollectionPath,
			}
		})
	}

	return {
		setEntrySelection,
		setSelectedEntryPaths: (paths: Set<string>) =>
			state.update({ selectedEntryPaths: paths }),
		setSelectionAnchorPath: (path: string | null) =>
			state.update({ selectionAnchorPath: path }),
		resetSelection: () =>
			setEntrySelection({ selectedIds: new Set(), anchorId: null }),
		lockAiEntries: (paths: string[]) => updateEntryLocks(paths, true),
		unlockAiEntries: (paths: string[]) => updateEntryLocks(paths, false),
		setExpandedDirectories,
		expandDirectory: (path: string) =>
			setExpandedDirectories([...getSnapshot().expandedDirectories, path]),
		collapseDirectory: (path: string) =>
			setExpandedDirectories(
				getSnapshot().expandedDirectories.filter((value) => value !== path),
			),
		toggleDirectory: (path: string) => {
			const { expandedDirectories } = getSnapshot()
			return setExpandedDirectories(
				expandedDirectories.includes(path)
					? expandedDirectories.filter((value) => value !== path)
					: [...expandedDirectories, path],
			)
		},
		pinDirectory: (path: string) => updatePinnedDirectories(path, true),
		unpinDirectory: (path: string) => updatePinnedDirectories(path, false),
		setCurrentCollectionPath,
		toggleCollectionView: () => {
			const { currentCollectionPath, lastCollectionPath } = getSnapshot()
			setCurrentCollectionPath(
				currentCollectionPath ? null : lastCollectionPath,
			)
		},
		resetCollectionPath: () =>
			state.update({ currentCollectionPath: null, lastCollectionPath: null }),
	}
}
