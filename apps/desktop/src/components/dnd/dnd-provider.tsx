import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react"
import { useEditorRef } from "platejs/react"
import type React from "react"
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useShallow } from "zustand/react/shallow"
import { useStore } from "@/store"
import {
	type EditorDropPosition,
	type EditorDropTargetData,
	isDndDragEndEvent,
	isEditorDragData,
} from "./dnd-types"
import { handleEditorDrop } from "./editor-drop-handler"
import { handleExplorerDrop } from "./explorer-drop-handler"

type DndProviderProps = {
	children: React.ReactNode
}

type DragStartEvent = Parameters<
	NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragStart"]>
>[0]

type DragMoveEvent = Parameters<
	NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragMove"]>
>[0]

type DragEndEvent = Parameters<
	NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>
>[0]

type Point = {
	x: number
	y: number
}

type EditorDropIndicator = {
	targetData: EditorDropTargetData
	lineStyle: {
		left: number
		top: number
		width: number
	}
}

const DND_SENSORS = [
	PointerSensor.configure({
		activationConstraints: {
			distance: { value: 4 },
		},
	}),
]

const EDITOR_OVERLAY_CLEANUP_SELECTOR =
	"[data-editor-drop-zone], [data-editor-drop-line]"
const EDITOR_BLOCK_SELECTOR = "[data-editor-block-id]"
const EDITOR_SCROLL_ROOT_SELECTOR = "[data-editor-scroll-root]"

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function isPoint(value: unknown): value is Point {
	return (
		isRecord(value) &&
		typeof value.x === "number" &&
		typeof value.y === "number"
	)
}

function isPointWithinRect(point: Point, rect: DOMRect | ClientRect) {
	return (
		point.x >= rect.left &&
		point.x <= rect.right &&
		point.y >= rect.top &&
		point.y <= rect.bottom
	)
}

function isEditorSourceData(data: unknown): data is {
	kind: "editor"
	id?: string
} {
	return isRecord(data) && data.kind === "editor" && isEditorDragData(data)
}

function clearEditorOverlayAttributes(root: HTMLElement) {
	root.removeAttribute("data-editor-block-id")
	root.removeAttribute("data-editor-draggable-root")
	root.querySelectorAll<HTMLElement>(EDITOR_BLOCK_SELECTOR).forEach((node) => {
		node.removeAttribute("data-editor-block-id")
	})
	root
		.querySelectorAll<HTMLElement>("[data-editor-draggable-root]")
		.forEach((node) => {
			node.removeAttribute("data-editor-draggable-root")
		})
}

function buildEditorOverlayClone(sourceElement: Element): HTMLElement | null {
	const sourceRoot =
		sourceElement.closest("[data-editor-draggable-root]") ?? sourceElement
	const cloned = sourceRoot.cloneNode(true)
	if (!(cloned instanceof HTMLElement)) {
		return null
	}

	cloned.classList.remove("opacity-30")
	cloned.classList.add("pointer-events-none", "opacity-50")
	clearEditorOverlayAttributes(cloned)
	cloned.querySelectorAll(EDITOR_OVERLAY_CLEANUP_SELECTOR).forEach((node) => {
		node.remove()
	})

	return cloned
}

function EditorBlockDragOverlay({ sourceElement }: { sourceElement: Element }) {
	const containerRef = useRef<HTMLDivElement | null>(null)

	useLayoutEffect(() => {
		const container = containerRef.current
		if (!container) return

		const cloned = buildEditorOverlayClone(sourceElement)
		if (!cloned) {
			container.replaceChildren()
			return
		}

		container.replaceChildren(cloned)

		return () => {
			container.replaceChildren()
		}
	}, [sourceElement])

	return (
		<div
			ref={containerRef}
			className="pointer-events-none max-w-[min(80vw,800px)]"
			aria-hidden
		/>
	)
}

function findEditorBlockAtPoint(
	point: Point,
	elements: Element[] = document.elementsFromPoint(point.x, point.y),
) {
	for (const element of elements) {
		const block = element.closest<HTMLElement>(EDITOR_BLOCK_SELECTOR)
		if (block) {
			return block
		}
	}

	return null
}

function findEditorScrollRootAtPoint(
	point: Point,
	elements: Element[] = document.elementsFromPoint(point.x, point.y),
) {
	for (const element of elements) {
		const root = element.closest<HTMLElement>(EDITOR_SCROLL_ROOT_SELECTOR)
		if (root) {
			return root
		}
	}

	const roots = document.querySelectorAll<HTMLElement>(
		EDITOR_SCROLL_ROOT_SELECTOR,
	)
	for (const root of roots) {
		if (isPointWithinRect(point, root.getBoundingClientRect())) {
			return root
		}
	}

	return null
}

function getNearestEditorBlock(root: HTMLElement, point: Point) {
	const blocks = root.querySelectorAll<HTMLElement>(EDITOR_BLOCK_SELECTOR)
	let nearestBlock: HTMLElement | null = null
	let bestOutsideDistance = Number.POSITIVE_INFINITY
	let bestCenterDistance = Number.POSITIVE_INFINITY

	for (const block of blocks) {
		const rect = block.getBoundingClientRect()
		const outsideDistance =
			point.y < rect.top
				? rect.top - point.y
				: point.y > rect.bottom
					? point.y - rect.bottom
					: 0
		const centerDistance = Math.abs(point.y - (rect.top + rect.height / 2))

		if (
			outsideDistance < bestOutsideDistance ||
			(outsideDistance === bestOutsideDistance &&
				centerDistance < bestCenterDistance)
		) {
			nearestBlock = block
			bestOutsideDistance = outsideDistance
			bestCenterDistance = centerDistance
		}
	}

	return nearestBlock
}

function buildEditorDropIndicator(block: HTMLElement, point: Point) {
	const id = block.dataset.editorBlockId
	if (!id) {
		return null
	}

	const rect = block.getBoundingClientRect()
	const position: EditorDropPosition =
		point.y <= rect.top + rect.height / 2 ? "top" : "bottom"

	return {
		targetData: {
			kind: "editor" as const,
			id,
			position,
		},
		lineStyle: {
			left: rect.left,
			top: position === "top" ? rect.top : rect.bottom,
			width: rect.width,
		},
	}
}

function computeEditorDropIndicator(point: Point): EditorDropIndicator | null {
	const elements = document.elementsFromPoint(point.x, point.y)
	const hoveredBlock = findEditorBlockAtPoint(point, elements)

	if (hoveredBlock) {
		return buildEditorDropIndicator(hoveredBlock, point)
	}

	const scrollRoot = findEditorScrollRootAtPoint(point, elements)
	if (!scrollRoot) {
		return null
	}

	const nearestBlock = getNearestEditorBlock(scrollRoot, point)
	if (!nearestBlock) {
		return null
	}

	return buildEditorDropIndicator(nearestBlock, point)
}

function areEditorDropIndicatorsEqual(
	a: EditorDropIndicator | null,
	b: EditorDropIndicator | null,
) {
	if (a === b) {
		return true
	}

	if (!a || !b) {
		return false
	}

	return (
		a.targetData.id === b.targetData.id &&
		a.targetData.position === b.targetData.position &&
		a.lineStyle.left === b.lineStyle.left &&
		a.lineStyle.top === b.lineStyle.top &&
		a.lineStyle.width === b.lineStyle.width
	)
}

function EditorDropLine({ indicator }: { indicator: EditorDropIndicator }) {
	return (
		<div
			aria-hidden
			className="pointer-events-none fixed z-60 h-0.5 bg-blue-400 dark:bg-blue-600/80"
			style={{
				left: indicator.lineStyle.left,
				top: indicator.lineStyle.top,
				width: indicator.lineStyle.width,
				transform: "translateY(-50%)",
			}}
		/>
	)
}

export function DndProvider({ children }: DndProviderProps) {
	const editor = useEditorRef()
	const { moveEntry, selectedEntryPaths, resetSelection } = useStore(
		useShallow((state) => ({
			moveEntry: state.moveEntry,
			selectedEntryPaths: state.selectedEntryPaths,
			resetSelection: state.resetSelection,
		})),
	)
	const [editorDropIndicator, setEditorDropIndicator] =
		useState<EditorDropIndicator | null>(null)
	const lastPointerRef = useRef<Point | null>(null)
	const isDraggingRef = useRef(false)
	const frameRef = useRef<number | null>(null)

	const applyEditorDropIndicator = useCallback((point: Point | null) => {
		const nextIndicator = point ? computeEditorDropIndicator(point) : null
		setEditorDropIndicator((current) => {
			return areEditorDropIndicatorsEqual(current, nextIndicator)
				? current
				: nextIndicator
		})
	}, [])

	const cancelScheduledIndicatorUpdate = useCallback(() => {
		if (frameRef.current !== null) {
			window.cancelAnimationFrame(frameRef.current)
			frameRef.current = null
		}
	}, [])

	const scheduleEditorDropIndicator = useCallback(
		(point: Point | null) => {
			lastPointerRef.current = point

			if (frameRef.current !== null) {
				return
			}

			frameRef.current = window.requestAnimationFrame(() => {
				frameRef.current = null
				applyEditorDropIndicator(lastPointerRef.current)
			})
		},
		[applyEditorDropIndicator],
	)

	const resetEditorDropIndicator = useCallback(() => {
		cancelScheduledIndicatorUpdate()
		lastPointerRef.current = null
		setEditorDropIndicator(null)
	}, [cancelScheduledIndicatorUpdate])

	useEffect(() => {
		return () => {
			cancelScheduledIndicatorUpdate()
		}
	}, [cancelScheduledIndicatorUpdate])

	useEffect(() => {
		const handleScroll = () => {
			if (!isDraggingRef.current || !lastPointerRef.current) {
				return
			}

			scheduleEditorDropIndicator(lastPointerRef.current)
		}

		window.addEventListener("scroll", handleScroll, true)
		return () => {
			window.removeEventListener("scroll", handleScroll, true)
		}
	}, [scheduleEditorDropIndicator])

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			isDraggingRef.current = true
			const point = isPoint(event.operation.position.current)
				? event.operation.position.current
				: null
			scheduleEditorDropIndicator(point)
		},
		[scheduleEditorDropIndicator],
	)

	const handleDragMove = useCallback(
		(event: DragMoveEvent) => {
			scheduleEditorDropIndicator(isPoint(event.to) ? event.to : null)
		},
		[scheduleEditorDropIndicator],
	)

	const handleDragEnd = useCallback(
		async (rawEvent: DragEndEvent) => {
			const finalPoint = isPoint(rawEvent.operation.position.current)
				? rawEvent.operation.position.current
				: lastPointerRef.current
			cancelScheduledIndicatorUpdate()
			const syntheticTarget = finalPoint
				? (computeEditorDropIndicator(finalPoint)?.targetData ?? null)
				: null
			isDraggingRef.current = false
			resetEditorDropIndicator()

			if (!isDndDragEndEvent(rawEvent)) {
				return
			}

			const event = rawEvent
			if (event.canceled) {
				return
			}

			const handledByEditorDrop = await handleEditorDrop({
				event,
				editor,
				selectedEntryPaths,
				overrideTargetData: syntheticTarget,
			})
			if (handledByEditorDrop) {
				return
			}

			await handleExplorerDrop({
				event,
				moveEntry,
				selectedEntryPaths,
				resetSelection,
			})
		},
		[
			cancelScheduledIndicatorUpdate,
			editor,
			moveEntry,
			resetEditorDropIndicator,
			resetSelection,
			selectedEntryPaths,
		],
	)

	return (
		<DragDropProvider
			sensors={DND_SENSORS}
			onDragStart={handleDragStart}
			onDragMove={handleDragMove}
			onDragEnd={handleDragEnd}
		>
			{children}
			{editorDropIndicator ? (
				<EditorDropLine indicator={editorDropIndicator} />
			) : null}
			<DragOverlay>
				{(source) => {
					if (!source || !isEditorSourceData(source.data) || !source.element) {
						return null
					}

					return <EditorBlockDragOverlay sourceElement={source.element} />
				}}
			</DragOverlay>
		</DragDropProvider>
	)
}
