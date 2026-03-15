import { describe, expect, it } from "vitest"
import {
	formatMoveDirectoryPath,
	resolveMoveDirectoryPath,
} from "./directories"

describe("move-note directories", () => {
	it("preserves Windows drive roots when formatting and resolving paths", () => {
		expect(formatMoveDirectoryPath("C:\\", "C:\\projects")).toBe("projects")

		expect(
			resolveMoveDirectoryPath({
				workspacePath: "C:\\",
				candidateDirectories: ["C:\\", "C:\\projects"],
				destinationDir: "projects",
			}),
		).toBe("C:\\projects")
	})

	it("normalizes current-directory prefixes in relative destination inputs", () => {
		expect(
			resolveMoveDirectoryPath({
				workspacePath: "/ws",
				candidateDirectories: ["/ws", "/ws/projects"],
				destinationDir: "./projects",
			}),
		).toBe("/ws/projects")

		expect(
			resolveMoveDirectoryPath({
				workspacePath: "/ws",
				candidateDirectories: ["/ws", "/ws/projects"],
				destinationDir: "./",
			}),
		).toBe("/ws")
	})
})
