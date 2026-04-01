import { describe, expect, it } from "vitest"
import {
	coerceSettingsTab,
	getSettingsTabs,
	isSettingsTabAvailable,
} from "./settings-tabs"

describe("settings tabs", () => {
	it("keeps workspace-only tabs unavailable when workspace is closed", () => {
		expect(isSettingsTabAvailable("sync", false)).toBe(false)
		expect(isSettingsTabAvailable("indexing", false)).toBe(false)
		expect(isSettingsTabAvailable("ai", false)).toBe(true)
	})

	it("coerces unavailable tabs to preferences", () => {
		expect(coerceSettingsTab("sync", false)).toBe("preferences")
		expect(coerceSettingsTab("indexing", false)).toBe("preferences")
		expect(coerceSettingsTab("sync", true)).toBe("sync")
	})

	it("returns available tabs in section order", () => {
		expect(getSettingsTabs(true)).toEqual([
			"preferences",
			"sync",
			"indexing",
			"ai",
			"api-mcp",
			"hotkeys",
		])
		expect(getSettingsTabs(false)).toEqual([
			"preferences",
			"ai",
			"api-mcp",
			"hotkeys",
		])
	})
})
