import { describe, expect, it } from "vitest"
import {
	flattenWorkspaceFiles,
	getLinkedNoteDisplayName,
	isPathInsideWorkspaceRoot,
	type LinkWorkspaceEntry,
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
		const entries: LinkWorkspaceEntry[] = [
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

	it("derives display names from wiki targets and markdown paths", () => {
		expect(
			getLinkedNoteDisplayName({
				mode: "wiki",
				nextUrl: "docs/guide",
				wikiTarget: "docs/guide",
				isWebLink: false,
			}),
		).toBe("guide")

		expect(
			getLinkedNoteDisplayName({
				mode: "wiki",
				nextUrl: "docs/guide#section",
				wikiTarget: "docs/guide#section",
				isWebLink: false,
			}),
		).toBe("guide")

		expect(
			getLinkedNoteDisplayName({
				mode: "markdown",
				nextUrl: "./docs/guide.md",
				isWebLink: false,
			}),
		).toBe("guide")

		expect(
			getLinkedNoteDisplayName({
				mode: "markdown",
				nextUrl: "../docs/guide.mdx#h2",
				isWebLink: false,
			}),
		).toBe("guide")
	})

	it("returns null for anchor-only or web links", () => {
		expect(
			getLinkedNoteDisplayName({
				mode: "markdown",
				nextUrl: "#local-anchor",
				isWebLink: false,
			}),
		).toBeNull()

		expect(
			getLinkedNoteDisplayName({
				mode: "wiki",
				nextUrl: "https://example.com",
				isWebLink: true,
			}),
		).toBeNull()
	})

	it("checks whether an absolute path is inside workspace root", () => {
		expect(
			isPathInsideWorkspaceRoot("/workspace/docs/guide.md", "/workspace"),
		).toBe(true)
		expect(isPathInsideWorkspaceRoot("/workspace", "/workspace")).toBe(true)
		expect(
			isPathInsideWorkspaceRoot("/workspace/../etc/passwd", "/workspace"),
		).toBe(false)
		expect(
			isPathInsideWorkspaceRoot("/workspace-archive/guide.md", "/workspace"),
		).toBe(false)
		expect(
			isPathInsideWorkspaceRoot("/another-root/docs/guide.md", "/workspace"),
		).toBe(false)
	})
})
