import { describe, expect, it } from "vitest"
import { isPathEqualOrDescendant } from "./path-utils"

describe("path-utils", () => {
	it("treats normalized descendants as inside their parent path", () => {
		expect(
			isPathEqualOrDescendant("/workspace/images/../cover.png", "/workspace"),
		).toBe(true)
		expect(
			isPathEqualOrDescendant(
				"C:\\workspace\\images\\..\\cover.png",
				"C:/workspace",
			),
		).toBe(true)
	})

	it("rejects paths that escape the parent through traversal", () => {
		expect(
			isPathEqualOrDescendant("/workspace/../etc/passwd.jpg", "/workspace"),
		).toBe(false)
		expect(
			isPathEqualOrDescendant(
				"C:\\workspace\\..\\Windows\\secret.png",
				"C:/workspace",
			),
		).toBe(false)
	})

	it("still rejects sibling paths with a shared prefix", () => {
		expect(
			isPathEqualOrDescendant("/workspace-other/file.png", "/workspace"),
		).toBe(false)
	})
})
