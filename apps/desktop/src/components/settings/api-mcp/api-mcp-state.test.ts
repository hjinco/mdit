import { describe, expect, it } from "vitest"
import { getLocalApiToggleState } from "./api-mcp-state"

describe("api-mcp toggle state", () => {
	it("keeps the toggle enabled without any license state", () => {
		expect(getLocalApiToggleState(true)).toEqual({
			description: "Base URL: http://127.0.0.1:39123",
			disabled: false,
			checked: true,
		})
	})

	it("preserves the user toggle value", () => {
		expect(getLocalApiToggleState(false).checked).toBe(false)
	})
})
