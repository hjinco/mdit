import { describe, expect, it, vi } from "vitest"
import { handleTagClick, handleTagMouseDown } from "./node-tag"
import {
	createTagDecoratedRanges,
	findInlineTagMatches,
	normalizeTagQuery,
} from "./tag-utils"

describe("findInlineTagMatches", () => {
	it("finds inline and nested tags while preserving source text", () => {
		expect(findInlineTagMatches("See #Project and #Area/SubArea.")).toEqual([
			{
				value: "#Project",
				query: "#project",
				start: 4,
				end: 12,
			},
			{
				value: "#Area/SubArea",
				query: "#area/subarea",
				start: 17,
				end: 30,
			},
		])
	})

	it("ignores malformed boundaries and url fragments", () => {
		expect(
			findInlineTagMatches("https://example.com/#anchor foo#bar #okay"),
		).toEqual([
			{
				value: "#okay",
				query: "#okay",
				start: 36,
				end: 41,
			},
		])
	})
})

describe("createTagDecoratedRanges", () => {
	it("creates decorate ranges for matched tags", () => {
		expect(createTagDecoratedRanges("A #Tag", [0, 0])).toEqual([
			{
				anchor: { path: [0, 0], offset: 2 },
				focus: { path: [0, 0], offset: 6 },
				tag: true,
				tagLabel: "#Tag",
				tagQuery: "#tag",
			},
		])
	})
})

describe("normalizeTagQuery", () => {
	it("rejects invalid trailing separators", () => {
		expect(normalizeTagQuery("#project/")).toBeNull()
	})
})

describe("handleTagMouseDown", () => {
	it("prevents focus-stealing pointer interactions", () => {
		const openTagSearch = vi.fn()
		const preventDefault = vi.fn()
		const stopPropagation = vi.fn()

		handleTagMouseDown(
			{
				button: 0,
				altKey: false,
				ctrlKey: false,
				metaKey: false,
				shiftKey: false,
				preventDefault,
				stopPropagation,
			},
			{ openTagSearch },
			"#project/docs",
		)

		expect(preventDefault).toHaveBeenCalledOnce()
		expect(stopPropagation).toHaveBeenCalledOnce()
		expect(openTagSearch).not.toHaveBeenCalled()
	})

	it("does nothing for modified clicks", () => {
		const openTagSearch = vi.fn()

		handleTagMouseDown(
			{
				button: 0,
				altKey: false,
				ctrlKey: true,
				metaKey: false,
				shiftKey: false,
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
			},
			{ openTagSearch },
			"#project",
		)

		expect(openTagSearch).not.toHaveBeenCalled()
	})
})

describe("handleTagClick", () => {
	it("opens tag search with the normalized query", () => {
		const openTagSearch = vi.fn()
		const preventDefault = vi.fn()
		const stopPropagation = vi.fn()

		handleTagClick(
			{
				button: 0,
				altKey: false,
				ctrlKey: false,
				metaKey: false,
				shiftKey: false,
				preventDefault,
				stopPropagation,
			},
			{ openTagSearch },
			"#project/docs",
		)

		expect(preventDefault).toHaveBeenCalledOnce()
		expect(stopPropagation).toHaveBeenCalledOnce()
		expect(openTagSearch).toHaveBeenCalledWith("#project/docs")
	})
})
