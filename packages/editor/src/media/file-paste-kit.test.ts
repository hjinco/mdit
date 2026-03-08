import { describe, expect, it, vi } from "vitest"
import { resolveEditorImageLink } from "./image-link-resolver"

describe("file-paste-kit", () => {
	it("skips insertion when resolveImageLink throws", async () => {
		const error = new Error("copy failed")
		const onResolveImageLinkError = vi.fn()

		const result = await resolveEditorImageLink("/tmp/a.png", {
			resolveImageLink: vi.fn().mockRejectedValueOnce(error),
			onResolveImageLinkError,
		})

		expect(result).toBeNull()
		expect(onResolveImageLinkError).toHaveBeenCalledWith("/tmp/a.png", error)
	})

	it("falls back to the original path when no resolver is configured", async () => {
		const result = await resolveEditorImageLink("/tmp/a.png", {})

		expect(result).toEqual({ url: "/tmp/a.png" })
	})
})
