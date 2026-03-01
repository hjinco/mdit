import { describe, expect, it, vi } from "vitest"
import { resolveFrontmatterWikiLinks } from "./frontmatter-wiki-resolve-utils"

describe("frontmatter-wiki-resolve-utils", () => {
	it("resolves wiki targets while preserving explicit aliases", async () => {
		const resolver = vi.fn(async (rawTarget: string) => {
			if (rawTarget === "docs/guide") return "guide"
			if (rawTarget === "notes/todo") return "todo"
			return rawTarget
		})

		const next = await resolveFrontmatterWikiLinks(
			"Before [[docs/guide|Guide]] and [[notes/todo]] after",
			resolver,
		)

		expect(next).toBe("Before [[guide|Guide]] and [[todo]] after")
	})

	it("passes normalized fallback target to resolver", async () => {
		const resolver = vi.fn(async () => "guide")

		await resolveFrontmatterWikiLinks("[[docs/guide.md]]", resolver)

		expect(resolver).toHaveBeenCalledWith("docs/guide.md", "docs/guide")
	})

	it("returns input as-is when no resolver is provided", async () => {
		const value = "See [[docs/guide]]"
		await expect(resolveFrontmatterWikiLinks(value)).resolves.toBe(value)
	})
})
