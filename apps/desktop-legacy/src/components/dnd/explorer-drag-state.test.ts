import { describe, expect, it } from "vitest"
import { getDraggedExplorerPaths } from "./explorer-drag-state"

describe("getDraggedExplorerPaths", () => {
	it("returns only the source path when dragging an unselected entry", () => {
		const draggedPaths = getDraggedExplorerPaths(
			{ path: "/notes/two.md", name: "two.md", isDirectory: false },
			new Set(["/notes/one.md"]),
		)

		expect(draggedPaths).toEqual(new Set(["/notes/two.md"]))
	})

	it("returns only the source path when dragging a singly selected entry", () => {
		const draggedPaths = getDraggedExplorerPaths(
			{ path: "/notes/one.md", name: "one.md", isDirectory: false },
			new Set(["/notes/one.md"]),
		)

		expect(draggedPaths).toEqual(new Set(["/notes/one.md"]))
	})

	it("returns the full selected set when dragging one item from a multi-selection", () => {
		const draggedPaths = getDraggedExplorerPaths(
			{ path: "/notes/one.md", name: "one.md", isDirectory: false },
			new Set(["/notes/one.md", "/notes/two.md"]),
		)

		expect(draggedPaths).toEqual(new Set(["/notes/one.md", "/notes/two.md"]))
	})

	it("returns an empty set for non-file drag sources", () => {
		const draggedPaths = getDraggedExplorerPaths(
			{ id: "editor-block-1" },
			new Set(["/notes/one.md", "/notes/two.md"]),
		)

		expect(draggedPaths).toEqual(new Set())
	})
})
