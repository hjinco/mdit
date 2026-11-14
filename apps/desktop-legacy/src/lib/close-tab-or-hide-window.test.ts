import { describe, expect, it, vi } from "vitest"
import { closeTabOrHideWindow } from "./close-tab-or-hide-window"

describe("closeTabOrHideWindow", () => {
	it("closes the active tab without hiding the window", async () => {
		const closeActiveTab = vi.fn()
		const closeEditWindow = vi.fn()
		const hideWindow = vi.fn()

		await closeTabOrHideWindow({
			isEditMode: false,
			hasActiveTab: true,
			closeActiveTab,
			closeEditWindow,
			hideWindow,
			isMacPlatform: () => true,
		})

		expect(closeActiveTab).toHaveBeenCalledTimes(1)
		expect(closeEditWindow).not.toHaveBeenCalled()
		expect(hideWindow).not.toHaveBeenCalled()
	})

	it("closes the edit window in edit mode", async () => {
		const closeActiveTab = vi.fn()
		const closeEditWindow = vi.fn()
		const hideWindow = vi.fn()

		await closeTabOrHideWindow({
			isEditMode: true,
			hasActiveTab: true,
			closeActiveTab,
			closeEditWindow,
			hideWindow,
			isMacPlatform: () => true,
		})

		expect(closeActiveTab).not.toHaveBeenCalled()
		expect(closeEditWindow).toHaveBeenCalledTimes(1)
		expect(hideWindow).not.toHaveBeenCalled()
	})

	it("hides the window on macOS when there is no active tab", async () => {
		const closeActiveTab = vi.fn()
		const closeEditWindow = vi.fn()
		const hideWindow = vi.fn()

		await closeTabOrHideWindow({
			isEditMode: false,
			hasActiveTab: false,
			closeActiveTab,
			closeEditWindow,
			hideWindow,
			isMacPlatform: () => true,
		})

		expect(closeActiveTab).not.toHaveBeenCalled()
		expect(closeEditWindow).not.toHaveBeenCalled()
		expect(hideWindow).toHaveBeenCalledTimes(1)
	})

	it("does nothing when there is no active tab on non-macOS", async () => {
		const closeActiveTab = vi.fn()
		const closeEditWindow = vi.fn()
		const hideWindow = vi.fn()

		await closeTabOrHideWindow({
			isEditMode: false,
			hasActiveTab: false,
			closeActiveTab,
			closeEditWindow,
			hideWindow,
			isMacPlatform: () => false,
		})

		expect(closeActiveTab).not.toHaveBeenCalled()
		expect(closeEditWindow).not.toHaveBeenCalled()
		expect(hideWindow).not.toHaveBeenCalled()
	})
})
