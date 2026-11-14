import { describe, expect, it } from "vitest"
import { getTabIdForNumberShortcut } from "./hotkeys"

describe("getTabIdForNumberShortcut", () => {
	it("selects the first, second, and ninth tabs by number", () => {
		const tabs = Array.from({ length: 9 }, (_, index) => ({
			id: index + 101,
		}))

		expect(getTabIdForNumberShortcut(tabs, 1)).toBe(101)
		expect(getTabIdForNumberShortcut(tabs, 2)).toBe(102)
		expect(getTabIdForNumberShortcut(tabs, 9)).toBe(109)
	})

	it("returns null when the requested tab number does not exist", () => {
		const tabs = [{ id: 11 }, { id: 22 }, { id: 33 }]

		expect(getTabIdForNumberShortcut(tabs, 4)).toBeNull()
		expect(getTabIdForNumberShortcut(tabs, 9)).toBeNull()
	})

	it("maps shortcut 9 to the ninth tab instead of the last tab", () => {
		const tabs = Array.from({ length: 12 }, (_, index) => ({
			id: index + 1,
		}))

		expect(getTabIdForNumberShortcut(tabs, 9)).toBe(9)
	})
})
