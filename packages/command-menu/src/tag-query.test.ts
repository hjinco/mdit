import { describe, expect, it } from "vitest"
import {
	getTagOnlySearchQuery,
	isTagOnlyQuery,
	normalizeTagSearchQuery,
	normalizeTagSearchValue,
} from "./tag-query"

describe("normalizeTagSearchValue", () => {
	it("normalizes leading hashes and casing", () => {
		expect(normalizeTagSearchValue("#Project/Docs")).toBe("project/docs")
		expect(normalizeTagSearchQuery("#Project/Docs")).toBe("#project/docs")
	})

	it("rejects invalid or empty segments", () => {
		expect(normalizeTagSearchValue("#")).toBeNull()
		expect(normalizeTagSearchValue("#project/")).toBeNull()
		expect(normalizeTagSearchValue("#project//docs")).toBeNull()
		expect(normalizeTagSearchValue("#project,docs")).toBeNull()
	})
})

describe("isTagOnlyQuery", () => {
	it("accepts a single normalized tag token", () => {
		expect(isTagOnlyQuery("#Project/Docs")).toBe(true)
	})

	it("rejects mixed or malformed queries", () => {
		expect(isTagOnlyQuery("project")).toBe(false)
		expect(isTagOnlyQuery("#project docs")).toBe(false)
		expect(isTagOnlyQuery("#project/")).toBe(false)
	})
})

describe("getTagOnlySearchQuery", () => {
	it("returns null for plain note queries", () => {
		expect(getTagOnlySearchQuery("project")).toBeNull()
		expect(getTagOnlySearchQuery("docs/guide")).toBeNull()
	})

	it("returns a normalized query for tag-only inputs", () => {
		expect(getTagOnlySearchQuery("#Project")).toBe("#project")
		expect(getTagOnlySearchQuery("#Project/Docs")).toBe("#project/docs")
	})
})
