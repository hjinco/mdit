import { describe, expect, it } from "vitest"
import {
	collectRefreshDirectoryPaths,
	replaceDirectoryChildren,
} from "./tree-patch"

describe("watch/tree-patch", () => {
	it("collectRefreshDirectoryPaths collapses to top-most parent directories", () => {
		const paths = collectRefreshDirectoryPaths("/ws", [
			"docs/a.md",
			"docs/sub/b.md",
			"archive/c.md",
		])

		expect(paths).toEqual(["/ws/docs", "/ws/archive"])
	})

	it("collectRefreshDirectoryPaths treats sibling prefixes as distinct directories", () => {
		const paths = collectRefreshDirectoryPaths("/ws", [
			"a/file.md",
			"a/sub/child.md",
			"a-archive/other.md",
		])

		expect(paths).toEqual(["/ws/a", "/ws/a-archive"])
	})

	it("replaceDirectoryChildren updates only target directory subtree", () => {
		const entries = [
			{
				path: "/ws/docs",
				name: "docs",
				isDirectory: true,
				children: [
					{
						path: "/ws/docs/old.md",
						name: "old.md",
						isDirectory: false,
					},
				],
			},
			{
				path: "/ws/keep.md",
				name: "keep.md",
				isDirectory: false,
			},
		]

		const nextChildren = [
			{
				path: "/ws/docs/new.md",
				name: "new.md",
				isDirectory: false,
			},
		]

		const updated = replaceDirectoryChildren(
			entries,
			"/ws",
			"/ws/docs",
			nextChildren,
		)

		expect(updated[0]?.children).toEqual(nextChildren)
		expect(updated[1]).toEqual(entries[1])
	})

	it("replaceDirectoryChildren swaps root entries when workspace root is targeted", () => {
		const entries = [
			{
				path: "/ws/old.md",
				name: "old.md",
				isDirectory: false,
			},
		]
		const nextRootEntries = [
			{
				path: "/ws/new.md",
				name: "new.md",
				isDirectory: false,
			},
		]

		const updated = replaceDirectoryChildren(
			entries,
			"/ws",
			"/ws",
			nextRootEntries,
		)

		expect(updated).toEqual(nextRootEntries)
	})
})
