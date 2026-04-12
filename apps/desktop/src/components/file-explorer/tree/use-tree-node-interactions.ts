import { useDraggable } from "@dnd-kit/react"
import type { FileTreeRenderNode } from "@mdit/file-tree"
import { useCallback } from "react"
import type { FileEntryDragData } from "@/components/dnd/dnd-types"
import { useDraggedExplorerPaths } from "@/components/dnd/explorer-drag-state"
import type { WorkspaceEntry } from "@/store"
import { getExplorerEntryDisplayName } from "../utils/display-name"

type UseTreeNodeInteractionsParams = {
	node: FileTreeRenderNode<WorkspaceEntry>
	onEntryPrimaryAction: (
		entry: WorkspaceEntry,
		event: React.MouseEvent<HTMLButtonElement>,
	) => void
	onEntryContextMenu: (entry: WorkspaceEntry) => void | Promise<void>
}

export function getExplorerDragData(entry: WorkspaceEntry): FileEntryDragData {
	return {
		path: entry.path,
		isDirectory: entry.isDirectory,
		name: entry.name,
		displayName: getExplorerEntryDisplayName(entry.name, entry.isDirectory),
	}
}

export function useTreeNodeInteractions({
	node,
	onEntryPrimaryAction,
	onEntryContextMenu,
}: UseTreeNodeInteractionsParams) {
	const { entry } = node
	const isRenaming = node.isRenaming
	const isLocked = node.isLocked
	const isBusy = isRenaming || isLocked
	const isSelected = node.isSelected
	const draggedExplorerPaths = useDraggedExplorerPaths()

	const { ref: draggableRef, isDragging: isSourceDragging } = useDraggable({
		id: entry.path,
		data: getExplorerDragData(entry),
		disabled: isBusy,
	})
	const isDragging = isSourceDragging || draggedExplorerPaths.has(entry.path)

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
