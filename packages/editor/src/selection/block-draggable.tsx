import { useDraggable } from "@dnd-kit/react"
import { cn } from "@mdit/ui/lib/utils"
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
	setNodeRef,
	onMouseDown,
	...props
}: {
	type: string
	isFirstChild: boolean
	setNodeRef: (node: HTMLDivElement | null) => void
	onMouseDown: (e: MouseEvent<HTMLDivElement>) => void
}) {
	const topClass = getTopClass(type, isFirstChild)

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"editor-block-handle absolute -left-7 flex py-0.75 rounded",
				"opacity-0 transition-opacity group-hover:opacity-100 will-change-[opacity]",
				"cursor-grab active:cursor-grabbing",
				"text-muted-foreground/80 hover:bg-accent/50 z-50",
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
	onMouseDown,
	onClick,
	...props
}: {
	type: string
	isFirstChild: boolean
	onMouseDown: (e: MouseEvent<HTMLDivElement>) => void
	onClick: (e: MouseEvent<HTMLDivElement>) => void
}) {
	const topClass = getTopClass(type, isFirstChild)

	return (
		<div
			className={cn(
				"editor-block-handle absolute -left-13 flex p-0.75 rounded",
				"opacity-0 transition-opacity group-hover:opacity-100 will-change-[opacity]",
				"cursor-pointer",
				"text-muted-foreground/80 hover:bg-accent/50 z-50",
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

export function Draggable(props: PlateElementProps) {
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
	},
) {
	const { elementId } = props
	const isFirstChild = props.path.length === 1 && props.path[0] === 0

	const { ref: draggableRef, handleRef: dragHandleRef } = useDraggable({
		id: `editor-${elementId}`,
		data: { kind: "editor", id: elementId },
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
			data-editor-block-id={elementId}
		>
			<InsertHandle
				type={props.element.type}
				isFirstChild={isFirstChild}
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
				setNodeRef={dragHandleRef}
				onMouseDown={(e) => {
					e.preventDefault()
					e.stopPropagation()
				}}
				data-plate-prevent-deselect
			/>
			{props.children}
		</div>
	)
}
