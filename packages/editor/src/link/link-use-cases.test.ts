import { describe, expect, it, vi } from "vitest"
import type { LinkServices } from "./link-ports"
import {
	createLinkedNote,
	loadLinkSuggestions,
	resolvePreferredTarget,
} from "./link-use-cases"

describe("resolvePreferredTarget", () => {
	it("falls back when resolver is missing", async () => {
		await expect(
			resolvePreferredTarget({
				currentTabPath: "/workspace/note.md",
				fallbackTarget: "Note",
				preferFallbackWhenUnresolved: true,
				rawTarget: "Note",
				services: {},
				warnContext: "warn",
				workspacePath: "/workspace",
			}),
		).resolves.toBe("Note")
	})

	it("uses canonical target when resolver succeeds", async () => {
		await expect(
			resolvePreferredTarget({
				currentTabPath: "/workspace/note.md",
				fallbackTarget: "Note",
				preferFallbackWhenUnresolved: true,
				rawTarget: "Note",
				services: {
					resolver: {
						resolveWikiLink: vi.fn().mockResolvedValue({
							canonicalTarget: "Canonical",
							disambiguated: false,
							matchCount: 1,
							resolvedRelPath: "Canonical.md",
							unresolved: false,
						}),
					},
				},
				warnContext: "warn",
				workspacePath: "/workspace",
			}),
		).resolves.toBe("Canonical")
	})
})

describe("loadLinkSuggestions", () => {
	it("returns empty when suggestions port is missing", async () => {
		await expect(
			loadLinkSuggestions({
				currentTabPath: "/workspace/note.md",
				limit: 5,
				services: {},
				workspacePath: "/workspace",
			}),
		).resolves.toEqual([])
	})

	it("skips related notes when embedding config is unavailable", async () => {
		const getRelatedNotes = vi.fn()

		await expect(
			loadLinkSuggestions({
				currentTabPath: "/workspace/note.md",
				limit: 5,
				services: {
					suggestions: {
						getIndexingConfig: vi.fn().mockResolvedValue(null),
						getRelatedNotes,
					},
				},
				workspacePath: "/workspace",
			}),
		).resolves.toEqual([])

		expect(getRelatedNotes).not.toHaveBeenCalled()
	})
})

describe("createLinkedNote", () => {
	it("returns null when note creation is unavailable", async () => {
		await expect(
			createLinkedNote({
				currentTabPath: "/workspace/note.md",
				linkMode: "wiki",
				services: {
					noteCreation: undefined,
				},
				value: "New note",
				workspacePath: "/workspace",
			}),
		).resolves.toBeNull()
	})

	it("creates markdown links using relative paths without opening the file", async () => {
		const services: Pick<LinkServices, "noteCreation"> = {
			noteCreation: {
				createNote: vi.fn().mockResolvedValue("/workspace/folder/new-note.md"),
			},
		}

		await expect(
			createLinkedNote({
				currentTabPath: "/workspace/folder/current.md",
				linkMode: "markdown",
				services,
				value: "new-note",
				workspacePath: "/workspace",
			}),
		).resolves.toEqual({
			newFilePath: "/workspace/folder/new-note.md",
			nextUrl: "./new-note.md",
			nextWikiTarget: null,
		})
	})
})
