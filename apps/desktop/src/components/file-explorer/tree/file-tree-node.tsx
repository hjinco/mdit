import { cn } from "@mdit/ui/lib/utils"
import { useMemo } from "react"
import { useInlineEditableInput } from "../hooks/use-inline-editable-input"
import { getEntryButtonClassName } from "../utils/entry-classnames"
import type { TreeNodeProps } from "./tree-node.types"
import { TreeNodeRenameInput } from "./tree-node-rename-input"
import { useTreeNodeInteractions } from "./use-tree-node-interactions"

const INDENTATION_WIDTH = 12

export function FileTreeNode({
	entry,
	activeTabPath,
	depth,
	onEntryPrimaryAction,
	onEntryContextMenu,
	selectedEntryPaths,
	aiLockedEntryPaths,
	renamingEntryPath,
	onRenameSubmit,
	onRenameCancel,
}: TreeNodeProps) {
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

	const extension = useMemo(() => {
		if (entry.isDirectory) {
			return ""
		}

		const lastDotIndex = entry.name.lastIndexOf(".")
		if (lastDotIndex <= 0) {
			return ""
		}

		return entry.name.slice(lastDotIndex)
	}, [entry.isDirectory, entry.name])

	const baseName = useMemo(() => {
		if (entry.isDirectory || !extension) {
			return entry.name
		}

		return entry.name.slice(0, entry.name.length - extension.length)
	}, [entry.isDirectory, entry.name, extension])

	const isMarkdown = useMemo(
		() => !entry.isDirectory && extension.toLowerCase() === ".md",
		[entry.isDirectory, extension],
	)
	const isActiveNote = isMarkdown && entry.path === activeTabPath
	const showExtension = !isMarkdown && extension

	const renameInput = useInlineEditableInput({
		active: isRenaming,
		initialValue: baseName,
		onSubmit: async (trimmedName) => {
			let finalName = trimmedName
			if (extension && !trimmedName.endsWith(extension)) {
				finalName = `${trimmedName}${extension}`
			}
			await onRenameSubmit(entry, finalName)
		},
		onCancel: onRenameCancel,
	})

	return (
		<li>
			<button
				ref={setDraggableRef}
				type="button"
				id={entry.path}
				onClick={handlePrimaryAction}
				onContextMenu={handleContextMenu}
				className={cn(
					getEntryButtonClassName({
						isSelected,
						isActive: isActiveNote,
						isDragging,
						isRenaming,
						isLocked,
						widthClass: "w-full",
					}),
					showExtension && "pr-1",
				)}
				style={{ paddingLeft: `${(depth + 1) * INDENTATION_WIDTH}px` }}
				aria-current={isActiveNote ? "page" : undefined}
				disabled={isBusy}
			>
				<div
					className={cn(
						"relative flex-1 overflow-hidden whitespace-nowrap",
						!isRenaming && "text-overflow-mask",
					)}
				>
					<span className={cn("text-sm", isRenaming && "opacity-0")}>
						{baseName}
					</span>
					{isRenaming && (
						<TreeNodeRenameInput
							value={renameInput.value}
							setValue={renameInput.setValue}
							inputRef={renameInput.inputRef}
							onKeyDown={renameInput.onKeyDown}
							onBlur={renameInput.onBlur}
							className="pt-px"
						/>
					)}
				</div>
				{showExtension && (
					<span
						className={cn(
							"ml-auto shrink-0 px-1 py-0.5 text-xs rounded",
							"bg-muted/50 text-muted-foreground/60",
							"font-mono",
							isRenaming && "opacity-0",
						)}
					>
						{extension.slice(1)}
					</span>
				)}
			</button>
		</li>
	)
}
