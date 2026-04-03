import { describe, expect, it } from "vitest"
import type { Point } from "./editor-drop-indicator.helpers"
import { computeExplorerDropTarget } from "./explorer-drop-target.helpers"

type MockElement = {
	dataset?: Record<string, string | undefined>
	closest: (selector: string) => MockElement | null
}

function createExplorerTarget(path: string): HTMLElement {
	const target: MockElement = {
		dataset: { explorerDropPath: path },
		closest: (selector: string) =>
			selector === "[data-explorer-drop-path]" ? target : null,
	}

	return target as unknown as HTMLElement
}

function createExplorerRoot(path: string): HTMLElement {
	const root: MockElement = {
		dataset: { explorerDropRoot: path },
		closest: (selector: string) =>
			selector === "[data-explorer-drop-root]" ? root : null,
	}

	return root as unknown as HTMLElement
}

function createExplorerScope(path: string): HTMLElement {
	const scope: MockElement = {
		dataset: { explorerDropScope: path },
		closest: (selector: string) =>
			selector === "[data-explorer-drop-scope]" ? scope : null,
	}

	return scope as unknown as HTMLElement
}

describe("explorer-drop-target.helpers", () => {
	it("returns the row target directly under the pointer", () => {
		const point: Point = { x: 20, y: 20 }
		const target = createExplorerTarget("/workspace/folder")

		expect(
			computeExplorerDropTarget(point, {
				elementsFromPoint: () => [target],
			}),
		).toBe("/workspace/folder")
	})

	it("falls back to the workspace root when no row target is under the pointer", () => {
		const point: Point = { x: 20, y: 20 }
		const root = createExplorerRoot("/workspace")

		expect(
			computeExplorerDropTarget(point, {
				elementsFromPoint: () => [root],
			}),
		).toBe("/workspace")
	})

	it("prefers a folder row over the overlapping workspace root", () => {
		const point: Point = { x: 20, y: 20 }
		const target = createExplorerTarget("/workspace/folder")
		const root = createExplorerRoot("/workspace")

		expect(
			computeExplorerDropTarget(point, {
				elementsFromPoint: () => [target, root],
			}),
		).toBe("/workspace/folder")
	})

	it("falls back to the expanded folder subtree before the workspace root", () => {
		const point: Point = { x: 20, y: 20 }
		const scope = createExplorerScope("/workspace/folder")
		const root = createExplorerRoot("/workspace")

		expect(
			computeExplorerDropTarget(point, {
				elementsFromPoint: () => [scope, root],
			}),
		).toBe("/workspace/folder")
	})

	it("returns the scope when the pointer stays inside a subtree without a root element", () => {
		const point: Point = { x: 20, y: 20 }
		const scope = createExplorerScope("/workspace/folder")

		expect(
			computeExplorerDropTarget(point, {
				elementsFromPoint: () => [scope],
			}),
		).toBe("/workspace/folder")
	})
})
