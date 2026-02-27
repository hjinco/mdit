import { describe, expect, it } from "vitest"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { buildEntryMap, collectVisibleEntryPaths } from "./entry-tree"

function makeFile(path: string, name: string): WorkspaceEntry {
	return {
		path,
		name,
		isDirectory: false,
	}
}

function makeDirectory(
	path: string,
	name: string,
	children: WorkspaceEntry[] = [],
): WorkspaceEntry {
	return {
		path,
		name,
		isDirectory: true,
		children,
	}
}

describe("buildEntryMap", () => {
	it("maps both original and normalized paths", () => {
		const entries: WorkspaceEntry[] = [
			makeDirectory("C:\\workspace\\docs", "docs", [
				makeFile("C:\\workspace\\docs\\note.md", "note.md"),
			]),
		]

		const map = buildEntryMap(entries)

		expect(map.get("C:\\workspace\\docs")?.name).toBe("docs")
		expect(map.get("C:/workspace/docs")?.name).toBe("docs")
		expect(map.get("C:\\workspace\\docs\\note.md")?.name).toBe("note.md")
		expect(map.get("C:/workspace/docs/note.md")?.name).toBe("note.md")
	})
})

describe("collectVisibleEntryPaths", () => {
	it("traverses only expanded directories", () => {
		const entries: WorkspaceEntry[] = [
			makeDirectory("/workspace/folder-a", "folder-a", [
				makeFile("/workspace/folder-a/a.md", "a.md"),
			]),
			makeDirectory("/workspace/folder-b", "folder-b", [
				makeFile("/workspace/folder-b/b.md", "b.md"),
			]),
		]

		const visible = collectVisibleEntryPaths(entries, ["/workspace/folder-a"])

		expect(visible).toEqual([
			"/workspace/folder-a",
			"/workspace/folder-a/a.md",
			"/workspace/folder-b",
		])
	})
})
