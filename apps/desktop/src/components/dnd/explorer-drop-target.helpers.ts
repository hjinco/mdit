import type { Point } from "./editor-drop-indicator.helpers"

const EXPLORER_DROP_TARGET_SELECTOR = "[data-explorer-drop-path]"
const EXPLORER_DROP_SCOPE_SELECTOR = "[data-explorer-drop-scope]"
const EXPLORER_DROP_ROOT_SELECTOR = "[data-explorer-drop-root]"

type RectLike = Pick<DOMRect | ClientRect, "left" | "right" | "top" | "bottom">

type ElementLookup = {
	elementsFromPoint?: (x: number, y: number) => Element[]
	queryRoots?: () => Iterable<HTMLElement>
}

function isPointWithinRect(point: Point, rect: RectLike) {
	return (
		point.x >= rect.left &&
		point.x <= rect.right &&
		point.y >= rect.top &&
		point.y <= rect.bottom
	)
}

function findExplorerTargetAtPoint(elements: Element[]) {
	for (const element of elements) {
		const target = element.closest<HTMLElement>(EXPLORER_DROP_TARGET_SELECTOR)
		const path = target?.dataset.explorerDropPath
		if (path) {
			return path
		}
	}

	return null
}

function findExplorerScopeAtPoint(elements: Element[]) {
	for (const element of elements) {
		const scope = element.closest<HTMLElement>(EXPLORER_DROP_SCOPE_SELECTOR)
		const path = scope?.dataset.explorerDropScope
		if (path) {
			return path
		}
	}

	return null
}

function findExplorerRootAtPoint(
	point: Point,
	elements: Element[],
	queryRoots: () => Iterable<HTMLElement>,
) {
	for (const element of elements) {
		const root = element.closest<HTMLElement>(EXPLORER_DROP_ROOT_SELECTOR)
		const path = root?.dataset.explorerDropRoot
		if (path) {
			return path
		}
	}

	for (const root of queryRoots()) {
		if (
			root.dataset.explorerDropRoot &&
			isPointWithinRect(point, root.getBoundingClientRect())
		) {
			return root.dataset.explorerDropRoot
		}
	}

	return null
}

export function computeExplorerDropTarget(
	point: Point,
	lookup: ElementLookup = {},
) {
	const elementsFromPoint =
		lookup.elementsFromPoint ??
		((x: number, y: number) => document.elementsFromPoint(x, y))
	const queryRoots =
		lookup.queryRoots ??
		(() => document.querySelectorAll<HTMLElement>(EXPLORER_DROP_ROOT_SELECTOR))
	const elements = elementsFromPoint(point.x, point.y)

	return (
		findExplorerTargetAtPoint(elements) ??
		findExplorerScopeAtPoint(elements) ??
		findExplorerRootAtPoint(point, elements, queryRoots)
	)
}
