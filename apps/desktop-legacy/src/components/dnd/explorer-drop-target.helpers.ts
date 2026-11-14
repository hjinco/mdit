import type { Point } from "./editor-drop-indicator.helpers"

const EXPLORER_DROP_TARGET_SELECTOR = "[data-explorer-drop-path]"
const EXPLORER_DROP_SCOPE_SELECTOR = "[data-explorer-drop-scope]"
const EXPLORER_DROP_ROOT_SELECTOR = "[data-explorer-drop-root]"

type ElementLookup = {
	elementsFromPoint?: (x: number, y: number) => Element[]
}

export function computeExplorerDropTarget(
	point: Point,
	lookup: ElementLookup = {},
) {
	const elementsFromPoint =
		lookup.elementsFromPoint ??
		((x: number, y: number) => document.elementsFromPoint(x, y))
	const elements = elementsFromPoint(point.x, point.y)
	let scopePath: string | null = null

	for (const element of elements) {
		const target = element.closest<HTMLElement>(EXPLORER_DROP_TARGET_SELECTOR)
		const targetPath = target?.dataset.explorerDropPath
		if (targetPath) {
			return targetPath
		}

		if (!scopePath) {
			const scope = element.closest<HTMLElement>(EXPLORER_DROP_SCOPE_SELECTOR)
			scopePath = scope?.dataset.explorerDropScope ?? null
		}

		const root = element.closest<HTMLElement>(EXPLORER_DROP_ROOT_SELECTOR)
		const rootPath = root?.dataset.explorerDropRoot
		if (rootPath) {
			return scopePath ?? rootPath
		}
	}

	return scopePath
}
