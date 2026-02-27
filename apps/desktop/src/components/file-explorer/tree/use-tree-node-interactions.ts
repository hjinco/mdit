import { useDraggable } from "@dnd-kit/react"
import { useCallback, useMemo } from "react"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { hasPathConflictWithLockedPaths } from "@/utils/path-utils"

type UseTreeNodeInteractionsParams = {
	entry: WorkspaceEntry
	aiLockedEntryPaths: Set<string>
	renamingEntryPath: string | null
	selectedEntryPaths: Set<string>
	onEntryPrimaryAction: (
		entry: WorkspaceEntry,
		event: React.MouseEvent<HTMLButtonElement>,
	) => void
	onEntryContextMenu: (entry: WorkspaceEntry) => void | Promise<void>
}

export function useTreeNodeInteractions({
	entry,
	aiLockedEntryPaths,
	renamingEntryPath,
	selectedEntryPaths,
	onEntryPrimaryAction,
	onEntryContextMenu,
}: UseTreeNodeInteractionsParams) {
	const isRenaming = renamingEntryPath === entry.path
	const isLocked = useMemo(
		() => hasPathConflictWithLockedPaths([entry.path], aiLockedEntryPaths),
		[aiLockedEntryPaths, entry.path],
	)
	const isBusy = isRenaming || isLocked
	const isSelected = selectedEntryPaths.has(entry.path)

	const { ref: draggableRef, isDragging } = useDraggable({
		id: entry.path,
		data: {
			path: entry.path,
			isDirectory: entry.isDirectory,
			name: entry.name,
		},
		disabled: isBusy,
	})

	const setDraggableRef = useCallback(
		(node: HTMLButtonElement | null) => {
			draggableRef(node)
		},
		[draggableRef],
	)

	const handlePrimaryAction = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			if (isBusy) {
				return
			}
			onEntryPrimaryAction(entry, event)
		},
		[entry, isBusy, onEntryPrimaryAction],
	)

	const handleContextMenu = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.preventDefault()
			event.stopPropagation()

			if (isBusy) {
				return
			}

			onEntryContextMenu(entry)
		},
		[entry, isBusy, onEntryContextMenu],
	)

	return {
		isRenaming,
		isLocked,
		isBusy,
		isSelected,
		isDragging,
		setDraggableRef,
		handlePrimaryAction,
		handleContextMenu,
	}
}
