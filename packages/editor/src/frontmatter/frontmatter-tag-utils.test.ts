import { describe, expect, it } from "vitest"
import {
	applyFrontmatterKeyChange,
	applyFrontmatterTypeChange,
	formatFrontmatterTagLabel,
	getFrontmatterPropertyTypeOptions,
	getFrontmatterTagQuery,
	isTagsFrontmatterKey,
} from "./frontmatter-tag-utils"

describe("frontmatter-tag-utils", () => {
	it("detects the tags key case-insensitively", () => {
		expect(isTagsFrontmatterKey("tags")).toBe(true)
		expect(isTagsFrontmatterKey(" Tags ")).toBe(true)
		expect(isTagsFrontmatterKey("aliases")).toBe(false)
	})

	it("promotes rows renamed to tags into the canonical tags type", () => {
		expect(
			applyFrontmatterKeyChange("tags", "string", "#Project, Area"),
		).toEqual({
			type: "tags",
			value: ["Project", "Area"],
		})
	})

	it("demotes tags rows renamed away from tags back to array", () => {
		expect(
			applyFrontmatterKeyChange("aliases", "tags", ["Project", "Area"]),
		).toEqual({
			type: "array",
			value: ["Project", "Area"],
		})
	})

	it("keeps the tags key pinned to the tags type", () => {
		expect(applyFrontmatterTypeChange("tags", ["Project"], "array")).toEqual({
			key: "tags",
			type: "tags",
			value: ["Project"],
		})
	})

	it("renames the property key to tags when the dropdown selects tags", () => {
		expect(
			applyFrontmatterTypeChange("category", "#Project, Area", "tags"),
		).toEqual({
			key: "tags",
			type: "tags",
			value: ["Project", "Area"],
		})
	})

	it("limits type options for canonical tags rows", () => {
		expect(getFrontmatterPropertyTypeOptions("tags")).toEqual([
			{ value: "tags", label: "Tags" },
		])
		expect(getFrontmatterPropertyTypeOptions("aliases")).toEqual(
			expect.not.arrayContaining([{ value: "tags", label: "Tags" }]),
		)
	})

	it("formats display labels and normalized queries for tag chips", () => {
		expect(formatFrontmatterTagLabel("Project/Docs")).toBe("#Project/Docs")
		expect(getFrontmatterTagQuery("#Project/Docs")).toBe("#project/docs")
		expect(getFrontmatterTagQuery("bad tag")).toBeNull()
	})
})
