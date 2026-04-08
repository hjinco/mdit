import { describe, expect, it } from "vitest"
import {
	getFrontmatterBlockIndex,
	getNextBlockIndexAfterFrontmatter,
	getNextBlockInsertIndexAfterFrontmatter,
	getPreviousBlockIndexBeforeFrontmatter,
} from "./frontmatter-block-navigation"

describe("frontmatter-block-navigation", () => {
	it("finds the frontmatter block between title and body", () => {
		const children = [
			{ type: "note_title" },
			{ type: "frontmatter" },
			{ type: "p" },
		]

		expect(getFrontmatterBlockIndex(children)).toBe(1)
		expect(getPreviousBlockIndexBeforeFrontmatter(children)).toBe(0)
		expect(getNextBlockIndexAfterFrontmatter(children)).toBe(2)
		expect(getNextBlockInsertIndexAfterFrontmatter(children)).toBe(2)
	})

	it("returns a trailing insert index when frontmatter is the last block", () => {
		const children = [{ type: "note_title" }, { type: "frontmatter" }]

		expect(getPreviousBlockIndexBeforeFrontmatter(children)).toBe(0)
		expect(getNextBlockIndexAfterFrontmatter(children)).toBeNull()
		expect(getNextBlockInsertIndexAfterFrontmatter(children)).toBe(2)
	})

	it("returns null when there is no frontmatter block", () => {
		const children = [{ type: "note_title" }, { type: "p" }]

		expect(getFrontmatterBlockIndex(children)).toBe(-1)
		expect(getPreviousBlockIndexBeforeFrontmatter(children)).toBeNull()
		expect(getNextBlockIndexAfterFrontmatter(children)).toBeNull()
		expect(getNextBlockInsertIndexAfterFrontmatter(children)).toBeNull()
	})
})
