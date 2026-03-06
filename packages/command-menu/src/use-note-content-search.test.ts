import { describe, expect, it } from "vitest"
import {
	createSnippetFromLine,
	groupContentMatches,
} from "./use-note-content-search"

describe("createSnippetFromLine", () => {
	it("builds a contextual snippet around the query", () => {
		expect(
			createSnippetFromLine(
				"Before the matching content appears in this sentence and continues after it",
				"content",
			),
		).toContain("content")
	})
})

describe("groupContentMatches", () => {
	it("groups matches by note and attaches snippets", () => {
		const groups = groupContentMatches(
			[
				{
					path: "/ws/alpha.md",
					lineNumber: 3,
					lineText: "Alpha content line",
				},
				{
					path: "/ws/alpha.md",
					lineNumber: 4,
					lineText: "Another content line",
				},
				{
					path: "/ws/beta.md",
					lineNumber: 1,
					lineText: "Beta content line",
				},
			],
			"content",
		)

		expect(groups).toHaveLength(2)
		expect(groups[0]?.path).toBe("/ws/alpha.md")
		expect(groups[0]?.matches).toHaveLength(2)
		expect(groups[0]?.matches[0]?.snippet).toContain("content")
		expect(groups[1]?.path).toBe("/ws/beta.md")
	})
})
