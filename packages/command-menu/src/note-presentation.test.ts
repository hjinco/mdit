import { describe, expect, it } from "vitest"
import { resolveNotePresentation } from "./note-presentation"

describe("resolveNotePresentation", () => {
	it("reuses note metadata when available", () => {
		expect(
			resolveNotePresentation({
				note: {
					label: "Existing label",
					relativePath: "folder/existing.md",
				},
				path: "/workspace/folder/existing.md",
				workspacePath: "/workspace",
				fallbackName: "ignored.md",
			}),
		).toEqual({
			label: "Existing label",
			relativePath: "folder/existing.md",
			parentPathLabel: "folder",
		})
	})

	it("derives presentation from path when note metadata is missing", () => {
		expect(
			resolveNotePresentation({
				path: "/workspace/folder/derived.md",
				workspacePath: "/workspace",
				fallbackName: "derived.md",
			}),
		).toEqual({
			label: "derived",
			relativePath: "folder/derived.md",
			parentPathLabel: "folder",
		})
	})
})
