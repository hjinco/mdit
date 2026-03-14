import { useDraggable, useDroppable } from "@dnd-kit/react"
import { cn } from "@mdit/ui/lib/utils"
import { useBlockSelected } from "@platejs/selection/react"
import { GripVertical, Plus } from "lucide-react"
import { KEYS, type TElement } from "platejs"
import type { PlateElementProps } from "platejs/react"
import type { MouseEvent } from "react"
import { FRONTMATTER_KEY } from "../frontmatter"
import { insertSlashMenuBelow } from "../slash/insert-slash-menu"

const headingTopMap: Record<string, string> = {
	[KEYS.h1]: "top-13",
	[KEYS.h2]: "top-7",
	[KEYS.h3]: "top-5.25",
	[KEYS.h4]: "top-3.75",
	[KEYS.h5]: "top-3.75",
	[KEYS.h6]: "top-3",
}

const otherTypeTopMap: Record<string, string> = {
	[KEYS.codeBlock]: "top-1",
	[KEYS.table]: "top-5",
	[KEYS.img]: "top-2",
	[KEYS.blockquote]: "top-0.5",
	[KEYS.callout]: "top-0",
}

const getTopClass = (type: string, isFirstChild: boolean) => {
	if (isFirstChild && headingTopMap[type]) {
		return "top-1"
	}
	return headingTopMap[type] || otherTypeTopMap[type] || ""
}

export function DragHandle({
	type,
	isFirstChild,
	isFocusMode,
	setNodeRef,
	onMouseDown,
	...props
}: {
	type: string
	isFirstChild: boolean
	isFocusMode: boolean
	setNodeRef: (node: HTMLDivElement | null) => void
	onMouseDown: (e: MouseEvent<HTMLDivElement>) => void
}) {
	const topClass = getTopClass(type, isFirstChild)

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"absolute -left-7 flex py-0.75 rounded",
				"opacity-0 transition-opacity group-hover:opacity-100 will-change-[opacity]",
				"cursor-grab active:cursor-grabbing",
				"text-muted-foreground/80 hover:bg-accent/50 z-50",
				isFocusMode && "opacity-0 group-hover:opacity-0",
				"top-1.25",
				topClass,
			)}
			contentEditable={false}
			onClick={(e) => {
				e.preventDefault()
				e.stopPropagation()
			}}
			onMouseDown={onMouseDown}
			{...props}
		>
			<GripVertical className="size-4.5 stroke-[1.4]!" />
		</div>
	)
}

export function InsertHandle({
	type,
	isFirstChild,
	isFocusMode,
	onMouseDown,
	onClick,
	...props
}: {
	type: string
	isFirstChild: boolean
	isFocusMode: boolean
	onMouseDown: (e: MouseEvent<HTMLDivElement>) => void
	onClick: (e: MouseEvent<HTMLDivElement>) => void
}) {
	const topClass = getTopClass(type, isFirstChild)

	return (
		<div
			className={cn(
				"absolute -left-13 flex p-0.75 rounded",
				"opacity-0 transition-opacity group-hover:opacity-100 will-change-[opacity]",
				"cursor-pointer",
				"text-muted-foreground/80 hover:bg-accent/50 z-50",
				isFocusMode && "opacity-0 group-hover:opacity-0",
				"top-1.25",
				topClass,
			)}
			contentEditable={false}
			onMouseDown={onMouseDown}
			onClick={onClick}
			{...props}
		>
			<Plus className="size-4.5 stroke-[1.8]!" />
		</div>
	)
}

export function Draggable(
	props: PlateElementProps & {
		isFocusMode: boolean
	},
) {
	const elementId = props.element.id as string

	// If not the outermost node, render only children
	if (
		!elementId ||
		props.path.length > 1 ||
		props.element.type === FRONTMATTER_KEY
	) {
		return <>{props.children}</>
	}

	return <DraggableBlock {...props} elementId={elementId} />
}

function DraggableBlock(
	props: PlateElementProps & {
		elementId: string
		isFocusMode: boolean
	},
) {
	const { elementId, isFocusMode } = props
	const isFirstChild = props.path.length === 1 && props.path[0] === 0

	const {
		ref: draggableRef,
		handleRef: dragHandleRef,
		isDragging: isDraggingBlock,
	} = useDraggable({
		id: `editor-${elementId}`,
		data: { kind: "editor", id: elementId },
	})

	const isBlockSelected = useBlockSelected(elementId)
	const isDropZoneDisabled = isDraggingBlock || isBlockSelected

	const { ref: topDropRef, isDropTarget: isOverTop } = useDroppable({
		id: `editor-${elementId}-top`,
		data: { kind: "editor", id: elementId, position: "top" },
		disabled: isDropZoneDisabled,
	})

	const { ref: bottomDropRef, isDropTarget: isOverBottom } = useDroppable({
		id: `editor-${elementId}-bottom`,
		data: { kind: "editor", id: elementId, position: "bottom" },
		disabled: isDropZoneDisabled,
	})

	const handleInsertBelow = () => {
		const entry = props.editor.api.node<TElement>({
			at: [],
			block: true,
			match: (node) => node.id === elementId,
		})
		if (!entry) return

		insertSlashMenuBelow(props.editor, entry)
	}

	return (
		<div
			ref={draggableRef}
			className="group relative transition-opacity flow-root"
			data-editor-draggable-root
		>
			<InsertHandle
				type={props.element.type}
				isFirstChild={isFirstChild}
				isFocusMode={isFocusMode}
				onMouseDown={(e) => {
					e.preventDefault()
					e.stopPropagation()
				}}
				onClick={(e) => {
					e.preventDefault()
					e.stopPropagation()
					handleInsertBelow()
				}}
				data-plate-prevent-deselect
			/>
			<DragHandle
				type={props.element.type}
				isFirstChild={isFirstChild}
				isFocusMode={isFocusMode}
				setNodeRef={dragHandleRef}
				onMouseDown={(e) => {
					e.preventDefault()
					e.stopPropagation()
				}}
				data-plate-prevent-deselect
			/>
			{/* Top drop zone */}
			<div
				ref={topDropRef}
				className="absolute inset-x-0 top-0 h-1/2 z-10"
				style={{ pointerEvents: "none" }}
				contentEditable={false}
				data-editor-drop-zone
			/>
			{/* Bottom drop zone */}
			<div
				ref={bottomDropRef}
				className="absolute inset-x-0 bottom-0 h-1/2 z-10"
				style={{ pointerEvents: "none" }}
				contentEditable={false}
				data-editor-drop-zone
			/>
			{props.children}
			{/* Top drop line */}
			<div
				className={cn(
					"pointer-events-none absolute inset-x-0 -top-px h-0.5",
					"bg-blue-400 dark:bg-blue-600/80",
					"opacity-0",
					isOverTop && "opacity-100",
				)}
				contentEditable={false}
				data-editor-drop-line
			/>
			{/* Bottom drop line */}
			<div
				className={cn(
					"pointer-events-none absolute inset-x-0 -bottom-px h-0.5",
					"bg-blue-400 dark:bg-blue-600/80",
					"opacity-0",
					isOverBottom && "opacity-100",
				)}
				contentEditable={false}
				data-editor-drop-line
			/>
		</div>
	)
}
