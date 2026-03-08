import {
	type FileTreeAdapter,
	type FileTreeState,
	useFileTree,
} from "@mdit/file-tree"
import { useCallback, useMemo } from "react"
import type {
	WorkspaceEntry,
	WorkspaceEntrySelection,
} from "@/store/workspace/workspace-slice"

export const workspaceEntryFileTreeAdapter: FileTreeAdapter<WorkspaceEntry> = {
	getId: (entry) => entry.path,
	getPath: (entry) => entry.path,
	getName: (entry) => entry.name,
	getChildren: (entry) => entry.children,
	isDirectory: (entry) => entry.isDirectory,
}

type UseDesktopFileTreeParams = {
	entries: WorkspaceEntry[]
	expandedDirectories: string[]
	selectedEntryPaths: Set<string>
	selectionAnchorPath: string | null
	renamingEntryPath: string | null
	pendingNewFolderPath: string | null
	aiLockedEntryPaths: Set<string>
	activeTabPath: string | null
	setExpandedDirectories: (next: Set<string> | string[]) => Promise<void>
	setEntrySelection: (selection: WorkspaceEntrySelection) => void
}

export function useDesktopFileTree({
	entries,
	expandedDirectories,
	selectedEntryPaths,
	selectionAnchorPath,
	renamingEntryPath,
	pendingNewFolderPath,
	aiLockedEntryPaths,
	activeTabPath,
	setExpandedDirectories,
	setEntrySelection,
}: UseDesktopFileTreeParams) {
	const state = useMemo<FileTreeState>(
		() => ({
			expandedIds: new Set(expandedDirectories),
			selectedIds: selectedEntryPaths,
			anchorId: selectionAnchorPath,
			renamingId: renamingEntryPath,
			pendingCreateDirectoryId: pendingNewFolderPath,
			lockedIds: aiLockedEntryPaths,
			activeId: activeTabPath,
		}),
		[
			activeTabPath,
			aiLockedEntryPaths,
			expandedDirectories,
			pendingNewFolderPath,
			renamingEntryPath,
			selectedEntryPaths,
			selectionAnchorPath,
		],
	)

	const handleExpandedIdsChange = useCallback(
		(nextExpandedIds: Set<string>) =>
			void setExpandedDirectories(nextExpandedIds),
		[setExpandedDirectories],
	)

	const handleSelectionChange = useCallback(
		(nextSelectedIds: Set<string>, nextAnchorId: string | null) => {
			setEntrySelection({
				selectedIds: nextSelectedIds,
				anchorId: nextAnchorId,
			})
		},
		[setEntrySelection],
	)

	return useFileTree({
		entries,
		adapter: workspaceEntryFileTreeAdapter,
		state,
		onExpandedIdsChange: handleExpandedIdsChange,
		onSelectionChange: handleSelectionChange,
	})
}
