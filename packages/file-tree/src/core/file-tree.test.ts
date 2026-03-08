import { describe, expect, it } from "vitest"
import { createFileTreeIndex } from "./index-builder"
import { selectFileTreeItems } from "./selection"
import { buildRenderTree, getRangeIds, getVisibleIds } from "./selectors"
import type { FileTreeAdapter, FileTreeState } from "./types"

type TestEntry = {
	path: string
	name: string
	isDirectory: boolean
	children?: TestEntry[]
}

const adapter: FileTreeAdapter<TestEntry> = {
	getId: (entry) => entry.path,
	getPath: (entry) => entry.path,
	getName: (entry) => entry.name,
	getChildren: (entry) => entry.children,
	isDirectory: (entry) => entry.isDirectory,
}

const makeFile = (path: string, name: string): TestEntry => ({
	path,
	name,
	isDirectory: false,
})

const makeDirectory = (
	path: string,
	name: string,
	children: TestEntry[] = [],
): TestEntry => ({
	path,
	name,
	isDirectory: true,
	children,
})

const entries: TestEntry[] = [
	makeDirectory("/workspace/docs", "docs", [
		makeFile("/workspace/docs/a.md", "a.md"),
		makeDirectory("/workspace/docs/nested", "nested", [
			makeFile("/workspace/docs/nested/deep.md", "deep.md"),
		]),
	]),
	makeFile("/workspace/readme.md", "readme.md"),
]

const createState = (overrides?: Partial<FileTreeState>): FileTreeState => ({
	expandedIds: new Set<string>(),
	selectedIds: new Set<string>(),
	anchorId: null,
	renamingId: null,
	pendingCreateDirectoryId: null,
	lockedIds: new Set<string>(),
	activeId: null,
	...overrides,
})

describe("createFileTreeIndex", () => {
	it("builds parent and child relationships in visible order", () => {
		const index = createFileTreeIndex(entries, adapter)

		expect(index.rootIds).toEqual(["/workspace/docs", "/workspace/readme.md"])
		expect(index.nodesById.get("/workspace/docs")?.childIds).toEqual([
			"/workspace/docs/a.md",
			"/workspace/docs/nested",
		])
		expect(index.nodesById.get("/workspace/docs/nested")?.parentId).toBe(
			"/workspace/docs",
		)
		expect(index.nodesById.get("/workspace/docs/nested")?.depth).toBe(1)
	})
})

describe("getVisibleIds", () => {
	it("includes only descendants of expanded directories", () => {
		const index = createFileTreeIndex(entries, adapter)

		expect(getVisibleIds(index, createState())).toEqual([
			"/workspace/docs",
			"/workspace/readme.md",
		])
		expect(
			getVisibleIds(
				index,
				createState({
					expandedIds: new Set(["/workspace/docs"]),
				}),
			),
		).toEqual([
			"/workspace/docs",
			"/workspace/docs/a.md",
			"/workspace/docs/nested",
			"/workspace/readme.md",
		])
	})
})

describe("getRangeIds", () => {
	it("computes ranges using the current visible order", () => {
		const index = createFileTreeIndex(entries, adapter)
		const state = createState({
			expandedIds: new Set(["/workspace/docs"]),
		})

		expect(
			getRangeIds(index, state, "/workspace/docs/a.md", "/workspace/readme.md"),
		).toEqual([
			"/workspace/docs/a.md",
			"/workspace/docs/nested",
			"/workspace/readme.md",
		])
	})
})

describe("selectFileTreeItems", () => {
	it("preserves existing selection on toggle selection", () => {
		const visibleIds = [
			"/workspace/docs",
			"/workspace/docs/a.md",
			"/workspace/docs/nested",
			"/workspace/readme.md",
		]

		const result = selectFileTreeItems({
			targetId: "/workspace/readme.md",
			visibleIds,
			selectedIds: new Set(["/workspace/docs/a.md"]),
			anchorId: "/workspace/docs/a.md",
			modifiers: {
				metaKey: true,
			},
		})

		expect([...result.selectedIds]).toEqual([
			"/workspace/docs/a.md",
			"/workspace/readme.md",
		])
		expect(result.anchorId).toBe("/workspace/readme.md")
	})
})

describe("buildRenderTree", () => {
	it("projects render metadata from controlled state", () => {
		const index = createFileTreeIndex(entries, adapter)
		const tree = buildRenderTree(
			index,
			createState({
				expandedIds: new Set(["/workspace/docs", "/workspace/docs/nested"]),
				selectedIds: new Set(["/workspace/docs/nested/deep.md"]),
				renamingId: "/workspace/docs",
				pendingCreateDirectoryId: "/workspace/docs/nested",
				lockedIds: new Set(["/workspace/readme.md"]),
				activeId: "/workspace/docs/nested/deep.md",
			}),
		)

		expect(tree[0]).toMatchObject({
			id: "/workspace/docs",
			isExpanded: true,
			isRenaming: true,
			hasChildren: true,
		})
		expect(tree[0]?.children?.[1]).toMatchObject({
			id: "/workspace/docs/nested",
			isExpanded: true,
			isPendingCreateDirectory: true,
		})
		expect(tree[0]?.children?.[1]?.children?.[0]).toMatchObject({
			id: "/workspace/docs/nested/deep.md",
			isSelected: true,
			isActive: true,
		})
		expect(tree[1]).toMatchObject({
			id: "/workspace/readme.md",
			isLocked: true,
		})
	})
})
