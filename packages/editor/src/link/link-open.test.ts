import { describe, expect, it, vi } from "vitest"
import { openEditorLink } from "./link-open"
import type { LinkOpenServices } from "./link-ports"

function createServices(): LinkOpenServices {
	return {
		navigation: {
			openExternal: vi.fn(),
			openPath: vi.fn(),
		},
		workspace: {
			getSnapshot: () => ({
				entries: [
					{
						children: [],
						isDirectory: false,
						name: "note.md",
						path: "/workspace/note.md",
					},
				],
				tab: { path: "/workspace/current.md" },
				workspacePath: "/workspace",
			}),
			useSnapshot: () => ({
				entries: [],
				tab: null,
				workspacePath: null,
			}),
		},
	}
}

describe("openEditorLink", () => {
	it("opens external links through navigation", async () => {
		const services = createServices()

		await openEditorLink({
			href: "https://example.com",
			services,
		})

		expect(services.navigation.openExternal).toHaveBeenCalledWith(
			"https://example.com",
		)
	})

	it("opens resolved wiki links through the resolver", async () => {
		const services = createServices()
		services.resolver = {
			resolveWikiLink: vi.fn().mockResolvedValue({
				canonicalTarget: "note",
				disambiguated: false,
				matchCount: 1,
				resolvedRelPath: "note.md",
				unresolved: false,
			}),
		}

		await openEditorLink({
			href: "note",
			services,
			wiki: true,
			wikiTarget: "note",
		})

		expect(services.navigation.openPath).toHaveBeenCalledWith(
			"/workspace/note.md",
		)
	})

	it("falls back to relative markdown resolution when resolver fails", async () => {
		const services = createServices()
		services.resolver = {
			resolveWikiLink: vi.fn().mockRejectedValue(new Error("failed")),
		}

		await openEditorLink({
			href: "note.md",
			services,
		})

		expect(services.navigation.openPath).toHaveBeenCalledWith(
			"/workspace/note.md",
		)
	})
})
