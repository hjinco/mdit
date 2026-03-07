import { describe, expect, it } from "vitest"
import {
	buildImageModeUpdate,
	isImageModeToggleDisabled,
} from "./media-image-mode-utils"

describe("media-image-mode-utils", () => {
	it("disables embed toggling for external images", () => {
		expect(
			isImageModeToggleDisabled({ url: "https://example.com/image.png" }),
		).toBe(true)
		expect(isImageModeToggleDisabled({ url: "./assets/pic.png" })).toBe(false)
	})

	it("converts markdown image urls to embed targets", () => {
		const result = buildImageModeUpdate({
			element: { url: "./assets/pic.png" },
			mode: "embed",
			workspaceState: {
				tabPath: "/workspace/notes/today.md",
				workspacePath: "/workspace",
			},
		})

		expect(result).toEqual({
			url: "notes/assets/pic.png",
			embedTarget: "notes/assets/pic.png",
		})
	})

	it("converts embed targets back to markdown image urls", () => {
		const result = buildImageModeUpdate({
			element: {
				url: "notes/assets/pic.png",
				embedTarget: "notes/assets/pic.png",
			},
			mode: "markdown",
			workspaceState: {
				tabPath: "/workspace/notes/today.md",
				workspacePath: "/workspace",
			},
		})

		expect(result).toEqual({
			url: "./assets/pic.png",
		})
	})

	it("keeps existing embed targets stable when already embedded", () => {
		const result = buildImageModeUpdate({
			element: {
				url: "notes/assets/pic.png",
				embedTarget: "notes/assets/pic.png",
			},
			mode: "embed",
			workspaceState: {
				tabPath: "/workspace/notes/today.md",
				workspacePath: "/workspace",
			},
		})

		expect(result).toEqual({
			url: "notes/assets/pic.png",
			embedTarget: "notes/assets/pic.png",
		})
	})
})
