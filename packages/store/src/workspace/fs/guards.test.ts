import { describe, expect, it } from "vitest"
import {
	arePathsInsideWorkspace,
	hasLockedPathConflict,
	isMovingIntoDescendantPath,
	resolveLockPathsForSource,
} from "./guards"

describe("fs-guards", () => {
	it("resolveLockPathsForSource excludes source when allowLockedSourcePath is true", () => {
		const lockedPaths = new Set(["/ws/a.md", "/ws/b.md"])

		const resolved = resolveLockPathsForSource(lockedPaths, "/ws/a.md", true)

		expect(Array.from(resolved)).toEqual(["/ws/b.md"])
	})

	it("hasLockedPathConflict detects descendant conflicts", () => {
		const result = hasLockedPathConflict(
			["/ws/source"],
			new Set(["/ws/source/a.md"]),
		)

		expect(result).toBe(true)
	})

	it("isMovingIntoDescendantPath returns true for descendant destination", () => {
		expect(isMovingIntoDescendantPath("/ws/source", "/ws/source/child")).toBe(
			true,
		)
	})

	it("arePathsInsideWorkspace validates all paths", () => {
		expect(arePathsInsideWorkspace(["/ws/a.md", "/ws/dir"], "/ws")).toBe(true)
		expect(arePathsInsideWorkspace(["/ws/a.md", "/other/b.md"], "/ws")).toBe(
			false,
		)
	})
})
