import { describe, expect, it } from "vitest"
import type { WorkspaceEntry } from "../workspace-state"
import {
	isPathDeletedByTargets,
	resolveDeletedMarkdownPaths,
} from "./deletion-indexing-helpers"

describe("deletion-indexing-helpers", () => {
	it("collects markdown deletions from direct paths and directory descendants", () => {
		const entries: WorkspaceEntry[] = [
			{
				path: "/ws/folder",
				name: "folder",
				isDirectory: true,
				children: [
					{
						path: "/ws/folder/target.md",
						name: "target.md",
						isDirectory: false,
					},
					{
						path: "/ws/folder/nested",
						name: "nested",
						isDirectory: true,
						children: [
							{
								path: "/ws/folder/nested/deep.md",
								name: "deep.md",
								isDirectory: false,
							},
						],
					},
					{
						path: "/ws/folder/ignored.txt",
						name: "ignored.txt",
						isDirectory: false,
					},
					{
						path: "/ws/folder/ignored.mdx",
						name: "ignored.mdx",
						isDirectory: false,
					},
				],
			},
		]

		const result = resolveDeletedMarkdownPaths(
			["/ws/folder", "/ws/standalone.md", "/ws/folder/target.md"],
			entries,
		)

		expect(new Set(result)).toEqual(
			new Set([
				"/ws/folder/target.md",
				"/ws/folder/nested/deep.md",
				"/ws/standalone.md",
			]),
		)
	})

	it("resolves deleted directory path even when input uses backslashes", () => {
		const entries: WorkspaceEntry[] = [
			{
				path: "/ws/folder",
				name: "folder",
				isDirectory: true,
				children: [
					{
						path: "/ws/folder/target.md",
						name: "target.md",
						isDirectory: false,
					},
				],
			},
		]

		const result = resolveDeletedMarkdownPaths(["/ws\\folder"], entries)

		expect(result).toEqual(["/ws/folder/target.md"])
	})

	it("matches deleted targets by exact path or descendant path only", () => {
		const deletedPathSet = new Set(["/ws/folder", "/ws/note.md"])

		expect(isPathDeletedByTargets("/ws/folder", deletedPathSet)).toBe(true)
		expect(isPathDeletedByTargets("/ws/folder/child.md", deletedPathSet)).toBe(
			true,
		)
		expect(isPathDeletedByTargets("/ws/note.md", deletedPathSet)).toBe(true)
		expect(
			isPathDeletedByTargets("/ws/folder-two/child.md", deletedPathSet),
		).toBe(false)
		expect(isPathDeletedByTargets("/ws/note.md.bak", deletedPathSet)).toBe(
			false,
		)
	})
})
