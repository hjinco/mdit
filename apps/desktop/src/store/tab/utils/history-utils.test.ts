import { describe, expect, it } from "vitest"

import { removePathFromHistory } from "./history-utils"

describe("removePathFromHistory", () => {
	const entry = (path: string) => ({ path, selection: null })

	it("removes every occurrence of a path and adjusts the index", () => {
		expect(
			removePathFromHistory(
				[entry("/notes/a.md"), entry("/notes/b.md"), entry("/notes/a.md")],
				2,
				"/notes/a.md",
			),
		).toEqual({
			history: [entry("/notes/b.md")],
			historyIndex: 0,
		})
	})

	it("returns -1 when the history becomes empty", () => {
		expect(
			removePathFromHistory([entry("/notes/a.md")], 0, "/notes/a.md"),
		).toEqual({
			history: [],
			historyIndex: -1,
		})
	})

	it("clamps the index when it exceeds the new history length", () => {
		expect(
			removePathFromHistory(
				[entry("/notes/a.md"), entry("/notes/b.md")],
				1,
				"/notes/b.md",
			),
		).toEqual({
			history: [entry("/notes/a.md")],
			historyIndex: 0,
		})
	})

	it("clamps a negative index to zero when history remains", () => {
		expect(
			removePathFromHistory(
				[entry("/notes/a.md"), entry("/notes/b.md")],
				-1,
				"/notes/a.md",
			),
		).toEqual({
			history: [entry("/notes/b.md")],
			historyIndex: 0,
		})
	})

	it("keeps history and index when the path is missing", () => {
		expect(
			removePathFromHistory(
				[entry("/notes/a.md"), entry("/notes/b.md"), entry("/notes/c.md")],
				1,
				"/notes/missing.md",
			),
		).toEqual({
			history: [
				entry("/notes/a.md"),
				entry("/notes/b.md"),
				entry("/notes/c.md"),
			],
			historyIndex: 1,
		})
	})

	it("selects the first remaining entry when all earlier entries are removed", () => {
		expect(
			removePathFromHistory(
				[
					entry("/notes/a.md"),
					entry("/notes/a.md"),
					entry("/notes/a.md"),
					entry("/notes/b.md"),
				],
				2,
				"/notes/a.md",
			),
		).toEqual({
			history: [entry("/notes/b.md")],
			historyIndex: 0,
		})
	})

	it("preserves additional entry fields for generic history entries", () => {
		const retainedEntry = {
			path: "/notes/b.md",
			selection: { anchor: "a", focus: "b" },
			meta: { pinned: true },
		}
		const result = removePathFromHistory(
			[
				{
					path: "/notes/a.md",
					selection: null,
					meta: { pinned: false },
				},
				retainedEntry,
			],
			1,
			"/notes/a.md",
		)

		expect(result.history).toEqual([retainedEntry])
		expect(result.history[0]).toBe(retainedEntry)
		expect(result.historyIndex).toBe(0)
	})
})
