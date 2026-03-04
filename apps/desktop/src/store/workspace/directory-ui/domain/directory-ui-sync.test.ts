import { describe, expect, it } from "vitest"
import type { WorkspaceEntry } from "../../workspace-state"
import { deriveDirectoryUiSyncResult } from "./directory-ui-sync"

const makeFile = (path: string, name: string): WorkspaceEntry => ({
	path,
	name,
	isDirectory: false,
	children: undefined,
})

const makeDir = (
	path: string,
	name: string,
	children: WorkspaceEntry[] = [],
): WorkspaceEntry => ({
	path,
	name,
	isDirectory: true,
	children,
})

describe("directory-ui/domain/directory-ui-sync", () => {
	it("returns unchanged flags when expanded and pinned lists are already valid", () => {
		const result = deriveDirectoryUiSyncResult({
			workspacePath: "/ws",
			previousExpanded: ["/ws/docs"],
			previousPinned: ["/ws/docs"],
			nextEntries: [
				makeDir("/ws/docs", "docs", [makeFile("/ws/docs/a.md", "a.md")]),
			],
		})

		expect(result.nextExpanded).toEqual(["/ws/docs"])
		expect(result.nextPinned).toEqual(["/ws/docs"])
		expect(result.expandedChanged).toBe(false)
		expect(result.pinnedChanged).toBe(false)
	})

	it("filters pins that are outside workspace or missing in entries", () => {
		const result = deriveDirectoryUiSyncResult({
			workspacePath: "/ws",
			previousExpanded: [],
			previousPinned: ["/outside", "/ws/docs", "/ws/missing"],
			nextEntries: [makeDir("/ws/docs", "docs")],
		})

		expect(result.nextPinned).toEqual(["/ws/docs"])
		expect(result.pinnedChanged).toBe(true)
	})

	it("drops expanded directories that no longer exist", () => {
		const result = deriveDirectoryUiSyncResult({
			workspacePath: "/ws",
			previousExpanded: ["/ws/docs", "/ws/missing"],
			previousPinned: [],
			nextEntries: [makeDir("/ws/docs", "docs")],
		})

		expect(result.nextExpanded).toEqual(["/ws/docs"])
		expect(result.expandedChanged).toBe(true)
	})
})
