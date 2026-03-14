import type { EditorDropPosition, EditorDropTargetData } from "./dnd-types"
import { isRecord } from "./dnd-utils"

const EDITOR_BLOCK_SELECTOR = "[data-editor-block-id]"
const EDITOR_SCROLL_ROOT_SELECTOR = "[data-editor-scroll-root]"

type RectLike = Pick<
	DOMRect | ClientRect,
	"left" | "right" | "top" | "bottom" | "width" | "height"
>

type ElementLookup = {
	elementsFromPoint?: (x: number, y: number) => Element[]
	queryScrollRoots?: () => Iterable<HTMLElement>
}

export type Point = {
	x: number
	y: number
}

export type EditorDropIndicator = {
	targetData: EditorDropTargetData
	lineStyle: {
		left: number
		top: number
		width: number
	}
}

export function isPoint(value: unknown): value is Point {
	return (
		isRecord(value) &&
		typeof value.x === "number" &&
		typeof value.y === "number"
	)
}

function isPointWithinRect(point: Point, rect: RectLike) {
	return (
		point.x >= rect.left &&
		point.x <= rect.right &&
		point.y >= rect.top &&
		point.y <= rect.bottom
	)
}

function findEditorBlockAtPoint(elements: Element[]) {
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
	elements: Element[],
	queryScrollRoots: () => Iterable<HTMLElement>,
) {
	for (const element of elements) {
		const root = element.closest<HTMLElement>(EDITOR_SCROLL_ROOT_SELECTOR)
		if (root) {
			return root
		}
	}

	for (const root of queryScrollRoots()) {
		if (isPointWithinRect(point, root.getBoundingClientRect())) {
			return root
		}
	}

	return null
}

export function getNearestEditorBlock(root: HTMLElement, point: Point) {
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

export function buildEditorDropIndicator(
	block: HTMLElement,
	point: Point,
): EditorDropIndicator | null {
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

export function computeEditorDropIndicator(
	point: Point,
	lookup: ElementLookup = {},
): EditorDropIndicator | null {
	const elementsFromPoint =
		lookup.elementsFromPoint ??
		((x: number, y: number) => document.elementsFromPoint(x, y))
	const queryScrollRoots =
		lookup.queryScrollRoots ??
		(() => document.querySelectorAll<HTMLElement>(EDITOR_SCROLL_ROOT_SELECTOR))
	const elements = elementsFromPoint(point.x, point.y)
	const hoveredBlock = findEditorBlockAtPoint(elements)

	if (hoveredBlock) {
		return buildEditorDropIndicator(hoveredBlock, point)
	}

	const scrollRoot = findEditorScrollRootAtPoint(
		point,
		elements,
		queryScrollRoots,
	)
	if (!scrollRoot) {
		return null
	}

	const nearestBlock = getNearestEditorBlock(scrollRoot, point)
	if (!nearestBlock) {
		return null
	}

	return buildEditorDropIndicator(nearestBlock, point)
}

export function areEditorDropIndicatorsEqual(
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
