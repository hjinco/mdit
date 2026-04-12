import { describe, expect, it } from "vitest"
import {
	getExplorerDragOverlayName,
	getExplorerDragOverlayStyle,
} from "./explorer-drag-overlay"

describe("getExplorerDragOverlayName", () => {
	it("prefers the display name when present", () => {
		expect(
			getExplorerDragOverlayName({
				name: "note.md",
				displayName: "note",
				isDirectory: false,
			}),
		).toBe("note")
	})

	it("falls back to the source name when no display name is provided", () => {
		expect(
			getExplorerDragOverlayName({
				name: "folder",
				isDirectory: true,
			}),
		).toBe("folder")
	})
})

describe("getExplorerDragOverlayStyle", () => {
	it("returns undefined when no source element is available", () => {
		expect(getExplorerDragOverlayStyle()).toBeUndefined()
	})

	it("preserves the source row width and padding", () => {
		const sourceElement = {
			getBoundingClientRect: () =>
				({
					width: 240,
				}) as DOMRect,
			ownerDocument: {
				defaultView: {
					getComputedStyle: () => ({
						boxSizing: "border-box",
						paddingTop: "2px",
						paddingRight: "8px",
						paddingBottom: "2px",
						paddingLeft: "36px",
					}),
				},
			},
		} as unknown as Element

		expect(getExplorerDragOverlayStyle(sourceElement)).toEqual({
			boxSizing: "border-box",
			paddingTop: "2px",
			paddingRight: "8px",
			paddingBottom: "2px",
			paddingLeft: "36px",
			width: "240px",
		})
	})
})
