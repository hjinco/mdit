import { useDroppable } from "@dnd-kit/react"
import { cn } from "@mdit/ui/lib/utils"
import { ChevronRight, PanelLeftIcon } from "lucide-react"
import { useCallback } from "react"
import { useAutoExpandOnHover } from "../hooks/use-auto-expand-on-hover"
import { useFolderDropZone } from "../hooks/use-folder-drop-zone"
import { useInlineEditableInput } from "../hooks/use-inline-editable-input"
import { getEntryButtonClassName } from "../utils/entry-classnames"
import { TreeInlineEditRow } from "./tree-inline-edit-row"
import type { DirectoryTreeNodeProps } from "./tree-node.types"
import { TreeNodeRenameInput } from "./tree-node-rename-input"
import { useTreeNodeInteractions } from "./use-tree-node-interactions"

const INDENTATION_WIDTH = 12

export function DirectoryTreeNode({
	entry,
	isFileExplorerOpen,
	depth,
	expandedDirectories,
	onDirectoryClick,
	onEntryPrimaryAction,
	onEntryContextMenu,
	selectedEntryPaths,
	aiLockedEntryPaths,
	renamingEntryPath,
	onRenameSubmit,
	onRenameCancel,
	pendingNewFolderPath,
	onNewFolderSubmit,
	onNewFolderCancel,
	onCollectionViewOpen,
	childrenTree,
}: DirectoryTreeNodeProps) {
	const hasChildren = (entry.children?.length ?? 0) > 0
	const isExpanded = expandedDirectories.includes(entry.path)
	const {
		isRenaming,
		isLocked,
		isBusy,
		isSelected,
		isDragging,
		setDraggableRef,
		handlePrimaryAction,
		handleContextMenu,
	} = useTreeNodeInteractions({
		entry,
		aiLockedEntryPaths,
		renamingEntryPath,
		selectedEntryPaths,
		onEntryPrimaryAction,
		onEntryContextMenu,
	})

	const { ref: droppableRef, isDropTarget } = useDroppable({
		id: `droppable-${entry.path}`,
		data: {
			path: entry.path,
			isDirectory: entry.isDirectory,
			depth,
		},
		disabled: !entry.isDirectory || isBusy || !isFileExplorerOpen,
	})

	const { isOver: isOverExternal, ref: externalDropRef } = useFolderDropZone({
		folderPath: entry.isDirectory ? entry.path : null,
		depth,
	})

	const isOver = isDropTarget || isOverExternal

	const handleExpand = useCallback(() => {
		onDirectoryClick(entry.path)
	}, [entry.path, onDirectoryClick])

	useAutoExpandOnHover({
		isOver,
		isDirectory: entry.isDirectory,
		isExpanded,
		hasChildren,
		onExpand: handleExpand,
	})

	const handleCollectionViewClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation()
			if (isBusy) {
				return
			}
			onCollectionViewOpen(entry)
		},
		[entry, isBusy, onCollectionViewOpen],
	)

	const renameInput = useInlineEditableInput({
		active: isRenaming,
		initialValue: entry.name,
		onSubmit: async (name) => {
			await onRenameSubmit(entry, name)
		},
		onCancel: onRenameCancel,
	})

	const hasPendingNewFolder = pendingNewFolderPath === entry.path
	const newFolderInput = useInlineEditableInput({
		active: hasPendingNewFolder,
		initialValue: "",
		onSubmit: async (folderName) => {
			await onNewFolderSubmit(entry.path, folderName)
		},
		onCancel: onNewFolderCancel,
	})

	return (
		<li>
			<div
				ref={(node) => {
					droppableRef(node)
					externalDropRef(node)
				}}
				className="relative rounded-sm"
			>
				{isOver && (
					<div className="absolute inset-0 z-10 rounded-sm bg-blue-100/30 dark:bg-blue-900/30 ring-2 ring-inset ring-blue-400 dark:ring-blue-600 pointer-events-none" />
				)}
				<div className="flex items-center group">
					<button
						ref={setDraggableRef}
						type="button"
						id={entry.path}
						onClick={handlePrimaryAction}
						onContextMenu={handleContextMenu}
						className={cn(
							getEntryButtonClassName({
								isSelected,
								isDragging,
								isRenaming,
								isLocked,
								widthClass: "flex-1",
							}),
						)}
						style={{ paddingLeft: `${depth * INDENTATION_WIDTH}px` }}
						disabled={isBusy}
					>
						<div
							className={cn(
								"shrink-0 pl-1.5 py-1",
								"text-foreground/70",
								"pointer-events-none",
							)}
							aria-hidden="true"
						>
							<ChevronRight
								className={cn(
									"size-4 transition-transform duration-150",
									isExpanded && "rotate-90",
								)}
							/>
						</div>
						<div
							className={cn(
								"relative flex-1 flex items-center overflow-hidden whitespace-nowrap",
								!isRenaming && "text-overflow-mask",
							)}
						>
							<span className={cn("text-sm", isRenaming && "opacity-0")}>
								{entry.name}
							</span>
							{isRenaming && (
								<TreeNodeRenameInput
									value={renameInput.value}
									setValue={renameInput.setValue}
									inputRef={renameInput.inputRef}
									onKeyDown={renameInput.onKeyDown}
									onBlur={renameInput.onBlur}
								/>
							)}
						</div>
					</button>
					<button
						type="button"
						onClick={handleCollectionViewClick}
						className={cn(
							"absolute right-1 shrink-0 px-0.5 py-0.5 outline-none",
							"bg-background text-foreground/70 hover:text-foreground rounded-sm",
							"opacity-0 group-hover:opacity-100 transition-opacity duration-250",
							"cursor-pointer",
							isBusy && "cursor-not-allowed opacity-50",
							isRenaming && "opacity-0",
						)}
						aria-label="Open collection view"
						disabled={isBusy}
					>
						<PanelLeftIcon className="size-4" />
					</button>
				</div>
				{hasPendingNewFolder && (
					<TreeInlineEditRow
						value={newFolderInput.value}
						setValue={newFolderInput.setValue}
						inputRef={newFolderInput.inputRef}
						onKeyDown={newFolderInput.onKeyDown}
						onBlur={newFolderInput.onBlur}
						className="px-2 mt-0.5"
						style={{
							paddingLeft: `${(depth + 1) * INDENTATION_WIDTH}px`,
						}}
					/>
				)}
				{hasChildren && isExpanded && (
					<ul className="space-y-0.5 mt-0.5">{childrenTree}</ul>
				)}
			</div>
		</li>
	)
}
