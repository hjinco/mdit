import type { DirEntry } from "@tauri-apps/plugin-fs"
import { describe, expect, it } from "vitest"

import {
	collectSiblingNoteNames,
	extractAndSanitizeName,
	extractName,
	sanitizeFileName,
	stripExtension,
} from "./ai-rename-utils"

const makeEntry = (name: string, overrides?: Partial<DirEntry>): DirEntry => ({
	name,
	isDirectory: false,
	isFile: true,
	isSymlink: false,
	...overrides,
})

describe("collectSiblingNoteNames", () => {
	it("filters out non-markdown, hidden, and current entries", () => {
		const entries: DirEntry[] = [
			makeEntry("current.md"),
			makeEntry(".hidden.md"),
			makeEntry("note-one.md"),
			makeEntry("picture.png"),
			makeEntry("Second.MD"),
			makeEntry("Folder", { isDirectory: true, isFile: false }),
		]

		const result = collectSiblingNoteNames(entries, "current.md")

		expect(result).toEqual(["note-one", "Second"])
	})

	it("limits to the first ten markdown siblings", () => {
		const entries = Array.from({ length: 12 }, (_, index) =>
			makeEntry(`Note ${index}.md`),
		)

		const result = collectSiblingNoteNames(entries, "another.md")

		expect(result).toHaveLength(10)
		expect(result[0]).toBe("Note 0")
		expect(result[9]).toBe("Note 9")
	})
})

describe("extractName", () => {
	it("uses the first line and strips problematic characters", () => {
		const raw = ' "Ideas <Draft>"\nSecond line that should be ignored'

		expect(extractName(raw)).toBe("Ideas  Draft")
	})
})

describe("sanitizeFileName", () => {
	it("removes markdown extensions, invalid characters, trailing dots, and extra whitespace", () => {
		expect(sanitizeFileName("  invalid:name?.md")).toBe("invalid name")
		expect(sanitizeFileName(" dotted title...")).toBe("dotted title")
	})

	it("truncates long names to sixty characters", () => {
		const longName = `${"a".repeat(70)}.md`
		const result = sanitizeFileName(longName)

		expect(result.length).toBe(60)
		expect(result).toBe("a".repeat(60))
	})
})

describe("extractAndSanitizeName", () => {
	it("extracts the first line and sanitizes the name", () => {
		const raw = ' "First Idea?.md"\nAnother suggestion'

		expect(extractAndSanitizeName(raw)).toBe("First Idea")
	})
})

describe("stripExtension", () => {
	it("removes the specified extension case-insensitively", () => {
		expect(stripExtension("Note.MD", ".md")).toBe("Note")
	})

	it("returns the original name when the extension does not match", () => {
		expect(stripExtension("diagram.png", ".md")).toBe("diagram.png")
	})
})
