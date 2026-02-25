import { describe, expect, it } from "vitest"
import type { WorkspaceEntry } from "@/store/workspace/workspace-state"
import {
	flattenWorkspaceFiles,
	stripFileExtensionForDisplay,
} from "./link-toolbar-utils"

describe("link-toolbar-utils", () => {
	it("strips only the last extension for display", () => {
		expect(stripFileExtensionForDisplay("note.md")).toBe("note")
		expect(stripFileExtensionForDisplay("photo.backup.png")).toBe(
			"photo.backup",
		)
		expect(stripFileExtensionForDisplay("README")).toBe("README")
		expect(stripFileExtensionForDisplay(".env")).toBe(".env")
	})

	it("flattens markdown files and strips display extensions", () => {
		const entries: WorkspaceEntry[] = [
			{
				path: "/workspace/docs",
				name: "docs",
				isDirectory: true,
				children: [
					{
						path: "/workspace/docs/guide.v1.md",
						name: "guide.v1.md",
						isDirectory: false,
					},
					{
						path: "/workspace/docs/logo.png",
						name: "logo.png",
						isDirectory: false,
					},
				],
			},
			{
				path: "/workspace/readme.md",
				name: "readme.md",
				isDirectory: false,
			},
		]

		expect(flattenWorkspaceFiles(entries, "/workspace")).toEqual([
			{
				absolutePath: "/workspace/docs/guide.v1.md",
				displayName: "guide.v1",
				relativePath: "docs/guide.v1.md",
				relativePathLower: "docs/guide.v1.md",
			},
			{
				absolutePath: "/workspace/readme.md",
				displayName: "readme",
				relativePath: "readme.md",
				relativePathLower: "readme.md",
			},
		])
	})
})
