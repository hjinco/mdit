import { useDraggable, useDroppable } from "@dnd-kit/react"
import { cn } from "@mdit/ui/lib/utils"
import { BlockSelectionPlugin } from "@platejs/selection/react"
import { GripVertical, Plus } from "lucide-react"
import { KEYS, PathApi } from "platejs"
import { type PlateElementProps, usePluginOption } from "platejs/react"
import type { MouseEvent } from "react"
import { FRONTMATTER_KEY } from "../frontmatter"
import { DATABASE_KEY } from "../plugins/database-kit"

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
	[DATABASE_KEY]: "top-4.5",
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
	setNodeRef: (node: HTMLDivElement) => void
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
	const isFirstChild = props.path.length === 1 && props.path[0] === 0
	const { isFocusMode } = props

	const { ref: draggableRef, isDragging } = useDraggable({
		id: `editor-${elementId}`,
		data: { kind: "editor", id: elementId },
	})

	const selectedIds = usePluginOption(BlockSelectionPlugin, "selectedIds") as
		| Set<string>
		| undefined

	const isBlockSelected = !!selectedIds && selectedIds.has(elementId)

	// Top drop zone - always call hooks, but only use when valid
	const { ref: topDropRef, isDropTarget: isOverTop } = useDroppable({
		id: `editor-${elementId}-top`,
		data: { kind: "editor", id: elementId, position: "top" },
		disabled: isDragging || isBlockSelected,
	})

	// Bottom drop zone - always call hooks, but only use when valid
	const { ref: bottomDropRef, isDropTarget: isOverBottom } = useDroppable({
		id: `editor-${elementId}-bottom`,
		data: { kind: "editor", id: elementId, position: "bottom" },
		disabled: isDragging || isBlockSelected,
	})

	// If not the outermost node, render only children
	if (
		!elementId ||
		props.path.length > 1 ||
		props.element.type === FRONTMATTER_KEY
	) {
		return <>{props.children}</>
	}

	const handleInsertBelow = () => {
		const entry = props.editor.api.node({
			at: [],
			block: true,
			match: (node) => node.id === elementId,
		})
		if (!entry) return

		const [node, currentPath] = entry
		if (currentPath.length !== 1) return

		const listStyleType = (node as { listStyleType?: string }).listStyleType
		const indent = (node as { indent?: number }).indent ?? 1

		const insertPath = PathApi.next(currentPath)
		const blockProps = listStyleType
			? {
					indent,
					listStyleType,
					...(listStyleType === KEYS.listTodo && { checked: false }),
				}
			: {}

		props.editor.tf.insertNodes(
			props.editor.api.create.block({
				type: props.editor.getType(KEYS.p),
				children: [{ text: "" }],
				...blockProps,
			}),
			{ at: insertPath },
		)
		props.editor.tf.select(insertPath, { edge: "start" })
		props.editor.tf.focus()
	}

	return (
		<div
			className={cn(
				"group relative transition-opacity flow-root",
				isDragging && !isBlockSelected && "opacity-30",
			)}
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
				setNodeRef={draggableRef}
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
			/>
			{/* Bottom drop zone */}
			<div
				ref={bottomDropRef}
				className="absolute inset-x-0 bottom-0 h-1/2 z-10"
				style={{ pointerEvents: "none" }}
				contentEditable={false}
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
			/>
		</div>
	)
}
