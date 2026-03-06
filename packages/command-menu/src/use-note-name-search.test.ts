import { describe, expect, it } from "vitest"
import { collectMarkdownNotes, filterNoteResults } from "./use-note-name-search"

describe("collectMarkdownNotes", () => {
	it("collects markdown notes from nested entries", () => {
		const results = collectMarkdownNotes(
			[
				{
					path: "/ws/folder",
					name: "folder",
					isDirectory: true,
					children: [
						{
							path: "/ws/folder/alpha.md",
							name: "alpha.md",
							isDirectory: false,
						},
						{
							path: "/ws/folder/image.png",
							name: "image.png",
							isDirectory: false,
						},
					],
				},
				{
					path: "/ws/root.md",
					name: "root.md",
					isDirectory: false,
				},
			],
			"/ws",
		)

		expect(results.map((result) => result.path)).toEqual([
			"/ws/root.md",
			"/ws/folder/alpha.md",
		])
		expect(results.map((result) => result.relativePath)).toEqual([
			"root.md",
			"folder/alpha.md",
		])
	})
})

describe("filterNoteResults", () => {
	it("returns the five most recently modified notes when query is empty", () => {
		const noteResults = Array.from({ length: 7 }, (_, index) => ({
			path: `/ws/note-${index}.md`,
			label: `Note ${index}`,
			normalizedLabel: `note ${index}`,
			relativePath: `note-${index}.md`,
			keywords: [`Note ${index}`],
			modifiedAt: new Date(2026, 0, index + 1),
		}))

		expect(filterNoteResults(noteResults, "").map((note) => note.path)).toEqual(
			[
				"/ws/note-6.md",
				"/ws/note-5.md",
				"/ws/note-4.md",
				"/ws/note-3.md",
				"/ws/note-2.md",
			],
		)
	})

	it("filters note names case-insensitively", () => {
		const noteResults = [
			{
				path: "/ws/Alpha.md",
				label: "Alpha",
				normalizedLabel: "alpha",
				relativePath: "Alpha.md",
				keywords: ["Alpha"],
			},
			{
				path: "/ws/Beta.md",
				label: "Beta",
				normalizedLabel: "beta",
				relativePath: "Beta.md",
				keywords: ["Beta"],
			},
		]

		expect(
			filterNoteResults(noteResults, "alp").map((note) => note.path),
		).toEqual(["/ws/Alpha.md"])
	})
})
