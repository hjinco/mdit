import { describe, expect, it, vi } from "vitest"

vi.mock("@/store", () => ({
	useStore: {
		getState: () => ({
			workspacePath: "/workspace",
		}),
	},
}))

import { buildImageLinkData } from "./image-link"

describe("buildImageLinkData", () => {
	it("rejects absolute image paths outside the workspace", () => {
		expect(buildImageLinkData("/external/a.png")).toEqual({ url: "" })
	})

	it("converts workspace image paths into relative embed targets", () => {
		expect(buildImageLinkData("/workspace/assets/a.png")).toEqual({
			url: "assets/a.png",
			embedTarget: "assets/a.png",
		})
	})
})
