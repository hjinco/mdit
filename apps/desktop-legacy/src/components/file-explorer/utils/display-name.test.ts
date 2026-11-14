import { describe, expect, it } from "vitest"
import { getExplorerEntryDisplayName } from "./display-name"

describe("getExplorerEntryDisplayName", () => {
	it("strips the last file extension for files", () => {
		expect(getExplorerEntryDisplayName("note.md", false)).toBe("note")
		expect(getExplorerEntryDisplayName("archive.tar.gz", false)).toBe(
			"archive.tar",
		)
	})

	it("preserves dotfiles", () => {
		expect(getExplorerEntryDisplayName(".env", false)).toBe(".env")
	})

	it("preserves directory names", () => {
		expect(getExplorerEntryDisplayName("folder.with.dot", true)).toBe(
			"folder.with.dot",
		)
	})
})
