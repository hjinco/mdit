import { describe, expect, it } from "vitest"
import { buildMovePrompt, formatMoveFolderCatalog } from "./prompt"

describe("formatMoveFolderCatalog", () => {
	it("renders root first, then workspace-relative paths in deterministic order", () => {
		const result = formatMoveFolderCatalog({
			workspacePath: "/ws",
			candidateDirectories: [
				"/ws/projects/zeta",
				"/ws",
				"/ws/inbox",
				"/ws/projects/alpha",
			],
		})

		expect(result).toBe(
			["1. .", "2. inbox", "3. projects/alpha", "4. projects/zeta"].join("\n"),
		)
	})

	it("deduplicates directories by normalized display path and keeps root", () => {
		const result = formatMoveFolderCatalog({
			workspacePath: "/ws",
			candidateDirectories: ["/ws", "/ws/", "/ws/inbox", "/ws/inbox/"],
		})

		expect(result).toBe(["1. .", "2. inbox"].join("\n"))
	})
})

describe("buildMovePrompt", () => {
	it("renders a compact relative folder catalog and fallback guidance", () => {
		const prompt = buildMovePrompt({
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/inbox/todo.md",
					name: "todo.md",
					isDirectory: false,
				},
			],
			candidateDirectories: ["/ws", "/ws/inbox", "/ws/projects"],
		})

		expect(prompt).toContain("Folder catalog:\n1. .\n2. inbox\n3. projects")
		expect(prompt).toContain("1. /ws/inbox/todo.md (current folder: inbox)")
		expect(prompt).toContain("- Use list_targets first.")
		expect(prompt).toContain(
			"- Use the initial folder catalog to choose destinations.",
		)
		expect(prompt).toContain(
			"- Call list_directories only if you need to re-check the available folders.",
		)
		expect(prompt).not.toContain("Available existing folders:")
		expect(prompt).not.toContain(
			"- Use list_targets and list_directories first.",
		)
		expect(prompt).not.toContain(
			"- Call move_note with the workspace-relative destination folder from the catalog.",
		)
		expect(prompt).not.toContain(
			"- Existing folders only. Do not create folders.",
		)
		expect(prompt).not.toContain(
			"- Call finish_organization only after all targets are handled.",
		)
		expect(prompt).not.toContain("/ws/projects")
	})
})
