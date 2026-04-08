import { describe, expect, it } from "vitest"

import {
	appendHistoryEntry,
	replaceHistoryPath,
} from "./history-navigation-utils"

describe("appendHistoryEntry", () => {
	const entry = (path: string) => ({ path, selection: null })

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
	const entry = (path: string) => ({ path, selection: null })

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
