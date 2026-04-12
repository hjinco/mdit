import { describe, expect, it } from "vitest"
import { getExplorerDragOverlayName } from "./explorer-drag-overlay"

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
