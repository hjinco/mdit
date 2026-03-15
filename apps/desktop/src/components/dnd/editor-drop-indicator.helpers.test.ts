import { describe, expect, it } from "vitest"
import {
	areEditorDropIndicatorsEqual,
	areEditorDropStatesEqual,
	buildEditorDropIndicator,
	computeEditorDropState,
	EMPTY_EDITOR_DROP_STATE,
	getNearestEditorBlock,
	type Point,
} from "./editor-drop-indicator.helpers"

type MockRect = {
	left: number
	right: number
	top: number
	bottom: number
	width: number
	height: number
}

type MockElement = {
	dataset?: Record<string, string | undefined>
	getBoundingClientRect: () => MockRect
	closest: (selector: string) => MockElement | null
	querySelectorAll?: (selector: string) => MockElement[]
}

function createBlock(id: string, rect: MockRect): HTMLElement {
	const block: MockElement = {
		dataset: { editorBlockId: id },
		getBoundingClientRect: () => rect,
		closest: (selector: string) =>
			selector === "[data-editor-block-id]" ? (block as MockElement) : null,
	}

	return block as unknown as HTMLElement
}

function createScrollRoot(blocks: HTMLElement[], rect: MockRect): HTMLElement {
	const root: MockElement = {
		getBoundingClientRect: () => rect,
		closest: (selector: string) =>
			selector === "[data-editor-scroll-root]" ? (root as MockElement) : null,
		querySelectorAll: (selector: string) =>
			selector === "[data-editor-block-id]"
				? (blocks as unknown as MockElement[])
				: [],
	}

	return root as unknown as HTMLElement
}

describe("editor-drop-indicator.helpers", () => {
	it("builds a top indicator when the pointer is above the midpoint", () => {
		const block = createBlock("block-1", {
			left: 10,
			right: 210,
			top: 100,
			bottom: 160,
			width: 200,
			height: 60,
		})
		const point: Point = { x: 30, y: 110 }

		expect(buildEditorDropIndicator(block, point)).toEqual({
			targetData: {
				kind: "editor",
				id: "block-1",
				position: "top",
			},
			lineStyle: {
				left: 10,
				top: 100,
				width: 200,
			},
		})
	})

	it("picks the nearest block inside the editor scroll root", () => {
		const blockA = createBlock("a", {
			left: 0,
			right: 100,
			top: 100,
			bottom: 140,
			width: 100,
			height: 40,
		})
		const blockB = createBlock("b", {
			left: 0,
			right: 100,
			top: 200,
			bottom: 240,
			width: 100,
			height: 40,
		})
		const root = createScrollRoot([blockA, blockB], {
			left: 0,
			right: 300,
			top: 0,
			bottom: 400,
			width: 300,
			height: 400,
		})
		const point: Point = { x: 40, y: 185 }

		expect(getNearestEditorBlock(root, point)).toBe(blockB)
		expect(
			computeEditorDropState(point, {
				elementsFromPoint: () => [root],
				queryScrollRoots: () => [root],
			}),
		).toEqual({
			indicator: {
				targetData: {
					kind: "editor",
					id: "b",
					position: "top",
				},
				lineStyle: {
					left: 0,
					top: 200,
					width: 100,
				},
			},
			isPointerInEditor: true,
		})
	})

	it("marks the pointer as in-editor when directly over a block", () => {
		const block = createBlock("block-1", {
			left: 10,
			right: 210,
			top: 100,
			bottom: 160,
			width: 200,
			height: 60,
		})
		const point: Point = { x: 30, y: 110 }

		expect(
			computeEditorDropState(point, {
				elementsFromPoint: () => [block],
				queryScrollRoots: () => [],
			}),
		).toEqual({
			indicator: {
				targetData: {
					kind: "editor",
					id: "block-1",
					position: "top",
				},
				lineStyle: {
					left: 10,
					top: 100,
					width: 200,
				},
			},
			isPointerInEditor: true,
		})
	})

	it("returns no indicator and no editor ownership outside the editor", () => {
		const point: Point = { x: 999, y: 999 }

		expect(
			computeEditorDropState(point, {
				elementsFromPoint: () => [],
				queryScrollRoots: () => [],
			}),
		).toEqual(EMPTY_EDITOR_DROP_STATE)
	})

	it("compares indicators by target and line geometry", () => {
		const base = {
			targetData: {
				kind: "editor" as const,
				id: "block-1",
				position: "bottom" as const,
			},
			lineStyle: {
				left: 10,
				top: 160,
				width: 200,
			},
		}

		expect(areEditorDropIndicatorsEqual(base, { ...base })).toBe(true)
		expect(
			areEditorDropIndicatorsEqual(base, {
				...base,
				lineStyle: {
					...base.lineStyle,
					top: 161,
				},
			}),
		).toBe(false)
	})

	it("compares drop states by ownership and indicator", () => {
		const base = {
			indicator: {
				targetData: {
					kind: "editor" as const,
					id: "block-1",
					position: "bottom" as const,
				},
				lineStyle: {
					left: 10,
					top: 160,
					width: 200,
				},
			},
			isPointerInEditor: true,
		}

		expect(areEditorDropStatesEqual(base, { ...base })).toBe(true)
		expect(
			areEditorDropStatesEqual(base, {
				...base,
				isPointerInEditor: false,
			}),
		).toBe(false)
	})
})
