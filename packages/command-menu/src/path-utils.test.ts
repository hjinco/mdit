import { describe, expect, it } from "vitest"
import { getParentPathLabel } from "./path-utils"

describe("getParentPathLabel", () => {
	it("returns the immediate containing folder path for relative note paths", () => {
		expect(getParentPathLabel("folder/note.md")).toBe("folder")
		expect(getParentPathLabel("nested/folder/note.md")).toBe("nested/folder")
	})

	it("returns root label for notes directly under the workspace root", () => {
		expect(getParentPathLabel("note.md")).toBe("/")
	})

	it("normalizes windows-style separators before deriving the parent path", () => {
		expect(getParentPathLabel("nested\\folder\\note.md")).toBe("nested/folder")
	})
})
