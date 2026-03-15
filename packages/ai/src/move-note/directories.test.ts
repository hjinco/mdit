import { describe, expect, it } from "vitest"
import {
	collectMoveDirectoryCatalogEntries,
	formatMoveDirectoryPath,
	normalizeMoveDirectoryPath,
} from "./directories"

describe("move-note directories", () => {
	it("preserves Windows drive roots when formatting catalog entries", () => {
		expect(formatMoveDirectoryPath("C:\\", "C:\\projects")).toBe("projects")

		expect(
			collectMoveDirectoryCatalogEntries({
				workspacePath: "C:\\",
				candidateDirectories: ["C:\\", "C:\\projects"],
			}),
		).toEqual([
			{ displayPath: ".", absolutePath: "C:\\" },
			{ displayPath: "projects", absolutePath: "C:\\projects" },
		])
	})

	it("normalizes current-directory prefixes in relative destination inputs", () => {
		expect(normalizeMoveDirectoryPath("./projects")).toBe("projects")
		expect(normalizeMoveDirectoryPath("./")).toBe(".")
	})
})
