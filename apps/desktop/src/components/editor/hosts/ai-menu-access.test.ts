import { describe, expect, it } from "vitest"
import { getDesktopAIMenuAccess } from "./ai-menu-access"

describe("desktop ai menu access", () => {
	it("always marks the AI menu as available", () => {
		expect(getDesktopAIMenuAccess("main").isLicenseValid).toBe(true)
		expect(getDesktopAIMenuAccess("quick-note").isLicenseValid).toBe(true)
	})

	it("only allows model settings navigation from the main window", () => {
		expect(getDesktopAIMenuAccess("main").canOpenModelSettings).toBe(true)
		expect(getDesktopAIMenuAccess("quick-note").canOpenModelSettings).toBe(
			false,
		)
	})
})
