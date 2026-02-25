import { describe, expect, it, vi } from "vitest"
import { generateUniqueFileName } from "./unique-file-name"

describe("generateUniqueFileName", () => {
	it("appends a numeric suffix while resolving collisions", async () => {
		const collisions = new Set(["/ws/Better Title.md", "/ws/Better Title 1.md"])
		const exists = vi.fn(async (path: string) => collisions.has(path))

		const result = await generateUniqueFileName(
			"Better Title.md",
			"/ws",
			exists,
		)

		expect(result).toEqual({
			fileName: "Better Title 2.md",
			fullPath: "/ws/Better Title 2.md",
		})
		expect(exists).toHaveBeenCalledWith("/ws/Better Title.md")
		expect(exists).toHaveBeenCalledWith("/ws/Better Title 1.md")
		expect(exists).toHaveBeenCalledWith("/ws/Better Title 2.md")
	})
})
