import { describe, expect, it } from "vitest"
import {
	getActiveFrontmatterWikiQuery,
	isSingleFrontmatterWikiLinkValue,
	parseFrontmatterWikiSegments,
	replaceFrontmatterWikiQuery,
} from "./frontmatter-wiki-link-utils"

describe("frontmatter-wiki-link-utils", () => {
	it("parses a simple wiki link token", () => {
		expect(parseFrontmatterWikiSegments("[[docs/guide]]")).toEqual([
			{ type: "wikiLink", target: "docs/guide", label: "docs/guide" },
		])
	})

	it("parses a wiki link alias token", () => {
		expect(parseFrontmatterWikiSegments("[[docs/guide|Guide]]")).toEqual([
			{ type: "wikiLink", target: "docs/guide", label: "Guide" },
		])
	})

	it("parses mixed text with multiple wiki links", () => {
		expect(
			parseFrontmatterWikiSegments(
				"Before [[docs/guide|Guide]] and [[notes/todo]] after",
			),
		).toEqual([
			{ type: "text", value: "Before " },
			{ type: "wikiLink", target: "docs/guide", label: "Guide" },
			{ type: "text", value: " and " },
			{ type: "wikiLink", target: "notes/todo", label: "notes/todo" },
			{ type: "text", value: " after" },
		])
	})

	it("keeps malformed wiki tokens as plain text", () => {
		expect(parseFrontmatterWikiSegments("[[|alias]]")).toEqual([
			{ type: "text", value: "[[|alias]]" },
		])
		expect(parseFrontmatterWikiSegments("open [[docs/guide")).toEqual([
			{ type: "text", value: "open [[docs/guide" },
		])
	})

	it("detects active frontmatter wiki query by cursor position", () => {
		const value = "prefix [[docs/gu"
		const active = getActiveFrontmatterWikiQuery(value, value.length)
		expect(active).toEqual({
			start: 7,
			end: value.length,
			query: "docs/gu",
		})
	})

	it("returns null when query is already closed or alias mode", () => {
		expect(getActiveFrontmatterWikiQuery("[[docs]] tail", 10)).toBeNull()
		expect(getActiveFrontmatterWikiQuery("[[docs|Alias", 12)).toBeNull()
	})

	it("returns null when cursor is before wiki token content", () => {
		expect(getActiveFrontmatterWikiQuery("[[docs/guide]]", 0)).toBeNull()
		expect(getActiveFrontmatterWikiQuery("[[docs/guide]]", 1)).toBeNull()
	})

	it("replaces active query with selected target", () => {
		const value = "see [[doc"
		const query = getActiveFrontmatterWikiQuery(value, value.length)
		expect(query).not.toBeNull()
		const next = replaceFrontmatterWikiQuery(value, query!, "docs/guide")
		expect(next).toBe("see [[docs/guide]]")
	})

	it("treats only a full single token as a wiki link value", () => {
		expect(isSingleFrontmatterWikiLinkValue("[[docs/guide]]")).toBe(true)
		expect(isSingleFrontmatterWikiLinkValue("[[docs/guide|Guide]]")).toBe(true)
		expect(isSingleFrontmatterWikiLinkValue("Before [[docs/guide]]")).toBe(
			false,
		)
		expect(isSingleFrontmatterWikiLinkValue("[[a]] [[b]]")).toBe(false)
		expect(isSingleFrontmatterWikiLinkValue("[[|alias]]")).toBe(false)
		expect(isSingleFrontmatterWikiLinkValue("open [[docs/guide")).toBe(false)
	})
})
