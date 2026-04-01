import { describe, expect, it } from "vitest"
import { getSettingsSections } from "./settings-tabs"

describe("settings navigation", () => {
	it("does not expose a license tab when a workspace is open", () => {
		const tabs = getSettingsSections(true).flatMap((section) => section.tabs)

		expect(tabs).toEqual([
			"preferences",
			"sync",
			"indexing",
			"ai",
			"api-mcp",
			"hotkeys",
		])
		expect(tabs).not.toContain("license")
	})

	it("keeps workspace-only tabs hidden without a workspace", () => {
		const tabs = getSettingsSections(false).flatMap((section) => section.tabs)

		expect(tabs).toEqual(["preferences", "ai", "api-mcp", "hotkeys"])
	})
})
