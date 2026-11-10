import { describe, expect, it } from "vitest"
import {
	appendHistoryEntry,
	removePathsFromHistory,
	replaceHistoryPath,
} from "./history"

const entry = (path: string) => ({ path, selection: null })

describe("appendHistoryEntry", () => {
	it("can append a duplicate path when explicitly allowed", () => {
		expect(
			appendHistoryEntry([entry("/ws/a.md")], 0, entry("/ws/a.md"), 50, {
				allowDuplicatePath: true,
			}),
		).toEqual({
			history: [entry("/ws/a.md"), entry("/ws/a.md")],
			historyIndex: 1,
			didChange: true,
		})
	})
})

describe("replaceHistoryPath", () => {
	it("updates descendants by default", () => {
		expect(
			replaceHistoryPath(
				[entry("/ws/folder/a.md"), entry("/ws/folder/sub/b.md")],
				"/ws/folder",
				"/ws/renamed",
			),
		).toEqual([entry("/ws/renamed/a.md"), entry("/ws/renamed/sub/b.md")])
	})

	it("keeps non-descendant paths unchanged", () => {
		expect(
			replaceHistoryPath(
				[
					entry("/ws/folder/a.md"),
					entry("/ws/folder/sub/b.md"),
					entry("/ws/other/c.md"),
				],
				"/ws/folder",
				"/ws/renamed",
			),
		).toEqual([
			entry("/ws/renamed/a.md"),
			entry("/ws/renamed/sub/b.md"),
			entry("/ws/other/c.md"),
		])
	})
})

describe("removePathsFromHistory", () => {
	it("removes every occurrence of a path and adjusts the index", () => {
		expect(
			removePathsFromHistory(
				[entry("/notes/a.md"), entry("/notes/b.md"), entry("/notes/a.md")],
				2,
				["/notes/a.md"],
			),
		).toEqual({
			history: [entry("/notes/b.md")],
			historyIndex: 0,
		})
	})

	it("returns -1 when the history becomes empty", () => {
		expect(
			removePathsFromHistory([entry("/notes/a.md")], 0, ["/notes/a.md"]),
		).toEqual({
			history: [],
			historyIndex: -1,
		})
	})

	it("clamps the index when it exceeds the new history length", () => {
		expect(
			removePathsFromHistory([entry("/notes/a.md"), entry("/notes/b.md")], 1, [
				"/notes/b.md",
			]),
		).toEqual({
			history: [entry("/notes/a.md")],
			historyIndex: 0,
		})
	})

	it("clamps a negative index to zero when history remains", () => {
		expect(
			removePathsFromHistory([entry("/notes/a.md"), entry("/notes/b.md")], -1, [
				"/notes/a.md",
			]),
		).toEqual({
			history: [entry("/notes/b.md")],
			historyIndex: 0,
		})
	})

	it("keeps history and index when the path is missing", () => {
		expect(
			removePathsFromHistory(
				[entry("/notes/a.md"), entry("/notes/b.md"), entry("/notes/c.md")],
				1,
				["/notes/missing.md"],
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
			removePathsFromHistory(
				[
					entry("/notes/a.md"),
					entry("/notes/a.md"),
					entry("/notes/a.md"),
					entry("/notes/b.md"),
				],
				2,
				["/notes/a.md"],
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
		const result = removePathsFromHistory(
			[
				{
					path: "/notes/a.md",
					selection: null,
					meta: { pinned: false },
				},
				retainedEntry,
			],
			1,
			["/notes/a.md"],
		)

		expect(result.history).toEqual([retainedEntry])
		expect(result.history[0]).toBe(retainedEntry)
		expect(result.historyIndex).toBe(0)
	})
	it("removes entries under deleted parent paths by default", () => {
		expect(
			removePathsFromHistory(
				[
					entry("/notes/a.md"),
					entry("/notes/folder/b.md"),
					entry("/notes/folder/nested/c.md"),
				],
				2,
				["/notes/folder"],
			),
		).toEqual({
			history: [entry("/notes/a.md")],
			historyIndex: 0,
		})
	})

	it("removes descendants when deleting a single parent path with mixed separators", () => {
		expect(
			removePathsFromHistory(
				[
					entry("C:/notes/a.md"),
					entry("C:/notes/folder/b.md"),
					entry("C:/notes/folder/nested/c.md"),
				],
				2,
				["C:\\notes\\folder"],
			),
		).toEqual({
			history: [entry("C:/notes/a.md")],
			historyIndex: 0,
		})
	})
})
