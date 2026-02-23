import { describe, expect, it } from "vitest"

import {
	doesWikiTargetReferToRelPath,
	isExternalWikiTarget,
	isMarkdownNotePath,
	normalizeSlashes,
	normalizeWikiQueryPath,
	pathSuffixMatches,
	resolveSourcePath,
	splitWikiTargetSuffix,
	stripMarkdownExtension,
	toWikiTargetFromAbsolutePath,
	withPreservedSurroundingWhitespace,
} from "./fs-structure-helpers"

describe("fs-structure-helpers", () => {
	it("normalizes windows separators", () => {
		expect(normalizeSlashes("a\\b\\c.md")).toBe("a/b/c.md")
	})

	it("detects markdown note path", () => {
		expect(isMarkdownNotePath("/ws/note.md")).toBe(true)
		expect(isMarkdownNotePath("/ws/note.MD")).toBe(true)
		expect(isMarkdownNotePath("/ws/note.mdx")).toBe(false)
	})

	it("strips markdown and mdx extensions", () => {
		expect(stripMarkdownExtension("note.md")).toBe("note")
		expect(stripMarkdownExtension("note.MDX")).toBe("note")
		expect(stripMarkdownExtension("note.txt")).toBe("note.txt")
	})

	it("normalizes wiki query path", () => {
		expect(normalizeWikiQueryPath(" ./folder/note.md ")).toBe("folder/note")
		expect(normalizeWikiQueryPath("\\\\folder\\\\note.mdx")).toBe(
			"folder//note",
		)
	})

	it("matches only exact suffix boundaries", () => {
		expect(pathSuffixMatches("folder/old", "old")).toBe(true)
		expect(pathSuffixMatches("folder/older", "old")).toBe(false)
	})

	it("detects external wiki targets", () => {
		expect(isExternalWikiTarget("#heading")).toBe(true)
		expect(isExternalWikiTarget("//example.com")).toBe(true)
		expect(isExternalWikiTarget("https://example.com")).toBe(true)
		expect(isExternalWikiTarget("folder/note")).toBe(false)
	})

	it("splits wiki target and suffix", () => {
		expect(splitWikiTargetSuffix("old#sec")).toEqual({
			path: "old",
			suffix: "#sec",
		})
		expect(splitWikiTargetSuffix("old")).toEqual({ path: "old", suffix: "" })
	})

	it("checks wiki target fallback match by relPath suffix", () => {
		expect(doesWikiTargetReferToRelPath("old", "folder/old.md")).toBe(true)
		expect(doesWikiTargetReferToRelPath("older", "folder/old.md")).toBe(false)
		expect(
			doesWikiTargetReferToRelPath("https://example.com", "folder/old.md"),
		).toBe(false)
	})

	it("preserves surrounding whitespace while replacing", () => {
		expect(withPreservedSurroundingWhitespace("  old  ", "new")).toBe("  new  ")
	})

	it("builds wiki target from absolute path", () => {
		expect(toWikiTargetFromAbsolutePath("/ws", "/ws/folder/new.md")).toBe(
			"folder/new",
		)
	})

	it("resolves source path and swaps renamed path", () => {
		expect(resolveSourcePath("/ws", "old.md", "/ws/old.md", "/ws/new.md")).toBe(
			"/ws/new.md",
		)
		expect(
			resolveSourcePath("/ws", "folder/source.md", "/ws/old.md", "/ws/new.md"),
		).toBe("/ws/folder/source.md")
	})
})
