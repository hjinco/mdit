import { describe, expect, it, vi } from "vitest"

vi.mock("@/store", () => ({
	useStore: {
		getState: () => ({
			copyEntry: vi.fn(),
			workspacePath: null,
		}),
	},
}))

import { prepareImageForEditorInsert } from "./image-import-host"

describe("image-import-host", () => {
	it("throws when an external image cannot be copied into the workspace", async () => {
		await expect(
			prepareImageForEditorInsert("/external/a.png", {
				getWorkspacePath: () => "/workspace",
				copyEntry: vi.fn().mockResolvedValueOnce(null),
				buildImageLink: vi.fn(),
			}),
		).rejects.toMatchObject({
			name: "EditorImageImportError",
			message: "Failed to import image into workspace.",
			path: "/external/a.png",
		})
	})

	it("returns copied image data when the workspace import succeeds", async () => {
		const buildImageLink = vi.fn().mockReturnValue({
			url: "assets/a.png",
			embedTarget: "assets/a.png",
		})

		const result = await prepareImageForEditorInsert("/external/a.png", {
			getWorkspacePath: () => "/workspace",
			copyEntry: vi.fn().mockResolvedValueOnce("/workspace/assets/a.png"),
			buildImageLink,
		})

		expect(result).toEqual({
			absolutePath: "/workspace/assets/a.png",
			url: "assets/a.png",
			embedTarget: "assets/a.png",
		})
		expect(buildImageLink).toHaveBeenCalledWith("/workspace/assets/a.png")
	})
})
