import { describe, expect, it } from "vitest"
import { getExplorerDragData } from "./use-tree-node-interactions"

describe("getExplorerDragData", () => {
	it("includes an overlay display name without the file extension", () => {
		expect(
			getExplorerDragData({
				path: "/notes/archive.tar.gz",
				name: "archive.tar.gz",
				isDirectory: false,
			}),
		).toEqual({
			path: "/notes/archive.tar.gz",
			name: "archive.tar.gz",
			isDirectory: false,
			displayName: "archive.tar",
		})
	})
})
