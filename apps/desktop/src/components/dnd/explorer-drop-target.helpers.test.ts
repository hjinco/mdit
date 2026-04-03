import { describe, expect, it } from "vitest"
import type { Point } from "./editor-drop-indicator.helpers"
import { computeExplorerDropTarget } from "./explorer-drop-target.helpers"

type MockRect = {
	left: number
	right: number
	top: number
	bottom: number
}

type MockElement = {
	dataset?: Record<string, string | undefined>
	getBoundingClientRect: () => MockRect
	closest: (selector: string) => MockElement | null
}

function createExplorerTarget(path: string): HTMLElement {
	const target: MockElement = {
		dataset: { explorerDropPath: path },
		getBoundingClientRect: () => ({
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
		}),
		closest: (selector: string) =>
			selector === "[data-explorer-drop-path]" ? target : null,
	}

	return target as unknown as HTMLElement
}

function createExplorerRoot(path: string, rect: MockRect): HTMLElement {
	const root: MockElement = {
		dataset: { explorerDropRoot: path },
		getBoundingClientRect: () => rect,
		closest: (selector: string) =>
			selector === "[data-explorer-drop-root]" ? root : null,
	}

	return root as unknown as HTMLElement
}

function createExplorerScope(path: string): HTMLElement {
	const scope: MockElement = {
		dataset: { explorerDropScope: path },
		getBoundingClientRect: () => ({
			left: 0,
			right: 0,
			top: 0,
			bottom: 0,
		}),
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
				queryRoots: () => [],
			}),
		).toBe("/workspace/folder")
	})

	it("falls back to the workspace root when no row target is under the pointer", () => {
		const point: Point = { x: 20, y: 20 }
		const root = createExplorerRoot("/workspace", {
			left: 0,
			right: 100,
			top: 0,
			bottom: 100,
		})

		expect(
			computeExplorerDropTarget(point, {
				elementsFromPoint: () => [root],
				queryRoots: () => [root],
			}),
		).toBe("/workspace")
	})

	it("prefers a folder row over the overlapping workspace root", () => {
		const point: Point = { x: 20, y: 20 }
		const target = createExplorerTarget("/workspace/folder")
		const root = createExplorerRoot("/workspace", {
			left: 0,
			right: 100,
			top: 0,
			bottom: 100,
		})

		expect(
			computeExplorerDropTarget(point, {
				elementsFromPoint: () => [target, root],
				queryRoots: () => [root],
			}),
		).toBe("/workspace/folder")
	})

	it("falls back to the expanded folder subtree before the workspace root", () => {
		const point: Point = { x: 20, y: 20 }
		const scope = createExplorerScope("/workspace/folder")
		const root = createExplorerRoot("/workspace", {
			left: 0,
			right: 100,
			top: 0,
			bottom: 100,
		})

		expect(
			computeExplorerDropTarget(point, {
				elementsFromPoint: () => [scope, root],
				queryRoots: () => [root],
			}),
		).toBe("/workspace/folder")
	})
})
