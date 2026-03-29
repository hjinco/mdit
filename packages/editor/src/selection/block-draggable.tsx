import { useDraggable } from "@dnd-kit/react"
import { cn } from "@mdit/ui/lib/utils"
import { BlockMenuPlugin, BlockSelectionPlugin } from "@platejs/selection/react"
import { GripVertical, Plus } from "lucide-react"
import { KEYS, type TElement } from "platejs"
import {
	type PlateElementProps,
	useEditorPlugin,
	usePlateState,
	usePluginOption,
} from "platejs/react"
import { type MouseEvent, type PointerEvent, useCallback, useRef } from "react"
import { FRONTMATTER_KEY } from "../frontmatter"
import { useIsTouchDevice } from "../shared/use-is-touch-device"
import { insertSlashMenuBelow } from "../slash/insert-slash-menu"
import { getBlockDragHandleContextMenuId } from "./block-menu-ids"

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
	isVisible,
	setNodeRef,
	onMouseDown,
	onPointerCancel,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	...props
}: {
	type: string
	isFirstChild: boolean
	isVisible?: boolean
	setNodeRef: (node: HTMLDivElement | null) => void
	onMouseDown: (e: MouseEvent<HTMLDivElement>) => void
	onPointerCancel: (e: PointerEvent<HTMLDivElement>) => void
	onPointerDown: (e: PointerEvent<HTMLDivElement>) => void
	onPointerMove: (e: PointerEvent<HTMLDivElement>) => void
	onPointerUp: (e: PointerEvent<HTMLDivElement>) => void
}) {
	const topClass = getTopClass(type, isFirstChild)

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"editor-block-handle absolute -left-7 flex py-0.75 rounded",
				"opacity-0 transition-opacity group-hover:opacity-100 will-change-[opacity]",
				isVisible && "opacity-100 bg-accent/50",
				"cursor-grab active:cursor-grabbing",
				"text-muted-foreground/80 hover:bg-accent/50 z-50",
				"top-1.25",
				topClass,
			)}
			contentEditable={false}
			onMouseDown={onMouseDown}
			onPointerCancel={onPointerCancel}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
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
	const { api, editor } = useEditorPlugin(BlockMenuPlugin)
	const openId = usePluginOption(BlockMenuPlugin, "openId")
	const [readOnly] = usePlateState("readOnly")
	const selectedIds = usePluginOption(BlockSelectionPlugin, "selectedIds")
	const isTouch = useIsTouchDevice()
	const dragHandleElementRef = useRef<HTMLDivElement | null>(null)
	const clickCandidateRef = useRef<{
		pointerId: number
		x: number
		y: number
		moved: boolean
	} | null>(null)

	const { ref: draggableRef, handleRef: dragHandleRef } = useDraggable({
		id: `editor-${elementId}`,
		data: { kind: "editor", id: elementId },
	})
	const handleMenuId = getBlockDragHandleContextMenuId(elementId)
	const isHandleMenuOpen = openId === handleMenuId

	const resetClickCandidate = useCallback(() => {
		clickCandidateRef.current = null
	}, [])

	const setDragHandleNodeRef = useCallback(
		(node: HTMLDivElement | null) => {
			dragHandleElementRef.current = node
			dragHandleRef(node)
		},
		[dragHandleRef],
	)

	const showBlockContextMenu = useCallback(() => {
		if (readOnly || isTouch) return

		const dragHandleElement = dragHandleElementRef.current
		if (!dragHandleElement) return

		const rect = dragHandleElement.getBoundingClientRect()
		if (!selectedIds?.has(elementId)) {
			editor.getApi(BlockSelectionPlugin).blockSelection.set(elementId)
		}
		api.blockMenu.show(handleMenuId, {
			x: rect.left,
			y: rect.top + rect.height / 2,
		})
	}, [
		api.blockMenu,
		editor,
		elementId,
		handleMenuId,
		isTouch,
		readOnly,
		selectedIds,
	])

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
				isVisible={isHandleMenuOpen}
				setNodeRef={setDragHandleNodeRef}
				onMouseDown={(e) => {
					e.preventDefault()
					e.stopPropagation()
				}}
				onPointerCancel={(e) => {
					if (e.currentTarget.hasPointerCapture(e.pointerId)) {
						e.currentTarget.releasePointerCapture(e.pointerId)
					}
					resetClickCandidate()
				}}
				onPointerDown={(e) => {
					if (!isTouch && e.pointerType === "mouse" && e.button === 0) {
						e.currentTarget.setPointerCapture(e.pointerId)
						clickCandidateRef.current = {
							pointerId: e.pointerId,
							x: e.clientX,
							y: e.clientY,
							moved: false,
						}
					}
				}}
				onPointerMove={(e) => {
					const clickCandidate = clickCandidateRef.current
					if (!clickCandidate || clickCandidate.pointerId !== e.pointerId)
						return

					if (
						Math.abs(e.clientX - clickCandidate.x) > 4 ||
						Math.abs(e.clientY - clickCandidate.y) > 4
					) {
						clickCandidate.moved = true
					}
				}}
				onPointerUp={(e) => {
					const clickCandidate = clickCandidateRef.current
					if (e.currentTarget.hasPointerCapture(e.pointerId)) {
						e.currentTarget.releasePointerCapture(e.pointerId)
					}
					resetClickCandidate()

					if (
						clickCandidate &&
						clickCandidate.pointerId === e.pointerId &&
						!clickCandidate.moved
					) {
						e.preventDefault()
						e.stopPropagation()
						showBlockContextMenu()
					}
				}}
				data-plate-prevent-deselect
			/>
			{props.children}
		</div>
	)
}
