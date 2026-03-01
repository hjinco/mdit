import { describe, expect, it } from "vitest"
import type { WorkspaceFileOption } from "../link/link-kit-types"
import {
	buildFrontmatterWikiSuggestions,
	getFrontmatterWikiSuggestionTargetKey,
} from "./frontmatter-wiki-suggestion-utils"

function createWorkspaceFile(relativePath: string): WorkspaceFileOption {
	const filename = relativePath.split("/").at(-1) ?? relativePath
	return {
		absolutePath: `/workspace/${relativePath}`,
		displayName: filename.replace(/\.mdx?$/i, ""),
		relativePath,
		relativePathLower: relativePath.toLowerCase(),
	}
}

const baseWorkspaceFiles: WorkspaceFileOption[] = [
	createWorkspaceFile("docs/guide.md"),
	createWorkspaceFile("docs/guide-advanced.md"),
	createWorkspaceFile("notes/todo.md"),
]

describe("frontmatter-wiki-suggestion-utils", () => {
	it("keeps query matching behavior", () => {
		const suggestions = buildFrontmatterWikiSuggestions(
			baseWorkspaceFiles,
			"guide",
		)
		expect(suggestions.map((entry) => entry.target)).toEqual([
			"docs/guide",
			"docs/guide-advanced",
		])
	})

	it("excludes targets listed in excludeTargetKeys", () => {
		const suggestions = buildFrontmatterWikiSuggestions(
			baseWorkspaceFiles,
			"guide",
			{
				excludeTargetKeys: new Set(["docs/guide"]),
			},
		)
		expect(suggestions.map((entry) => entry.target)).toEqual([
			"docs/guide-advanced",
		])
	})

	it("uses canonical key from case variants, alias, and plain path for exclusion", () => {
		const existingValues = [
			"[[Docs/Guide]]",
			"[[docs/guide|Guide]]",
			"docs/guide.md",
		]

		for (const existingValue of existingValues) {
			const excludeKey = getFrontmatterWikiSuggestionTargetKey(existingValue)
			expect(excludeKey).toBe("docs/guide")
			if (!excludeKey) {
				throw new Error("Expected canonical key to be generated")
			}

			const suggestions = buildFrontmatterWikiSuggestions(
				baseWorkspaceFiles,
				"guide",
				{
					excludeTargetKeys: new Set([excludeKey]),
				},
			)

			expect(suggestions.map((entry) => entry.target)).toEqual([
				"docs/guide-advanced",
			])
		}
	})

	it("returns null for mixed text with wiki token", () => {
		expect(
			getFrontmatterWikiSuggestionTargetKey("Before [[docs/guide]]"),
		).toBeNull()
	})

	it("fills up to 50 suggestions after exclusion", () => {
		const workspaceFiles = Array.from({ length: 80 }, (_, index) =>
			createWorkspaceFile(
				`notes/topic-${String(index + 1).padStart(2, "0")}.md`,
			),
		)
		const suggestions = buildFrontmatterWikiSuggestions(workspaceFiles, "", {
			excludeTargetKeys: new Set([
				"notes/topic-01",
				"notes/topic-02",
				"notes/topic-03",
				"notes/topic-04",
				"notes/topic-05",
			]),
		})

		expect(suggestions).toHaveLength(50)
		expect(suggestions[0]?.target).toBe("notes/topic-06")
		expect(suggestions.at(-1)?.target).toBe("notes/topic-55")
	})
})
