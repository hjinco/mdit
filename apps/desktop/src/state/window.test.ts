import { describe, expect, it } from "vitest"
import { createWindowState, type UIPreferences } from "./window"

function createPreferencesState() {
	return {
		fileExplorerOpen: true,
		fontScale: 1,
		chatPanelBetaEnabled: false,
	}
}

const createPreferences = (state: ReturnType<typeof createPreferencesState>) =>
	({
		getFileExplorerOpen: () => state.fileExplorerOpen,
		setFileExplorerOpen: (isOpen) => {
			state.fileExplorerOpen = isOpen
			return isOpen
		},
		getFontScale: () => state.fontScale,
		setFontScale: (value) => {
			state.fontScale = value
			return value
		},
		increaseFontScale: (currentValue) => {
			state.fontScale = currentValue + 0.1
			return state.fontScale
		},
		decreaseFontScale: (currentValue) => {
			state.fontScale = currentValue - 0.1
			return state.fontScale
		},
		resetFontScale: () => {
			state.fontScale = 1
			return state.fontScale
		},
		getChatPanelBetaEnabled: () => state.chatPanelBetaEnabled,
		setChatPanelBetaEnabled: (enabled) => {
			state.chatPanelBetaEnabled = enabled
			return enabled
		},
	}) satisfies UIPreferences

const createTestWindow = (preferencesState = createPreferencesState()) => ({
	store: createWindowState(createPreferences(preferencesState), "workspace"),
	preferencesState,
})

describe("window note info panel", () => {
	it("defaults isNoteInfoOpen to false", () => {
		const { store } = createTestWindow()

		expect(store.getSnapshot().isNoteInfoOpen).toBe(false)
	})

	it("sets note info panel open state directly", () => {
		const { store } = createTestWindow()

		store.commands.setNoteInfoOpen(true)
		expect(store.getSnapshot().isNoteInfoOpen).toBe(true)

		store.commands.setNoteInfoOpen(false)
		expect(store.getSnapshot().isNoteInfoOpen).toBe(false)
	})

	it("toggles note info panel open state", () => {
		const { store } = createTestWindow()

		store.commands.toggleNoteInfoOpen()
		expect(store.getSnapshot().isNoteInfoOpen).toBe(true)

		store.commands.toggleNoteInfoOpen()
		expect(store.getSnapshot().isNoteInfoOpen).toBe(false)
	})
})

describe("window command menu seed query", () => {
	it("opens the command menu with a seeded query", () => {
		const { store } = createTestWindow()

		store.commands.openCommandMenuWithQuery("#project/docs")

		expect(store.getSnapshot().isCommandMenuOpen).toBe(true)
		expect(store.getSnapshot().commandMenuInitialQuery).toBe("#project/docs")
	})

	it("clears the seeded query when the menu closes", () => {
		const { store } = createTestWindow()

		store.commands.openCommandMenuWithQuery("#project")
		store.commands.closeCommandMenu()

		expect(store.getSnapshot().isCommandMenuOpen).toBe(false)
		expect(store.getSnapshot().commandMenuInitialQuery).toBeNull()
	})

	it("opens the command menu without a seed for normal entry", () => {
		const { store } = createTestWindow()

		store.commands.openCommandMenuWithQuery("#project")
		store.commands.openCommandMenu()

		expect(store.getSnapshot().isCommandMenuOpen).toBe(true)
		expect(store.getSnapshot().commandMenuInitialQuery).toBeNull()
	})
})

describe("window chat panel beta", () => {
	it("defaults chat panel beta disabled and panel closed", () => {
		const { store } = createTestWindow()

		expect(store.getSnapshot().chatPanelBetaEnabled).toBe(false)
		expect(store.getSnapshot().isChatPanelOpen).toBe(false)
	})

	it("persists chat panel beta toggle through preferences", () => {
		const { store, preferencesState } = createTestWindow()

		store.commands.setChatPanelBetaEnabled(true)

		expect(store.getSnapshot().chatPanelBetaEnabled).toBe(true)
		expect(preferencesState.chatPanelBetaEnabled).toBe(true)
	})

	it("prevents opening panel when beta is disabled", () => {
		const { store } = createTestWindow()

		store.commands.setChatPanelOpen(true)
		expect(store.getSnapshot().isChatPanelOpen).toBe(false)

		store.commands.toggleChatPanelOpen()
		expect(store.getSnapshot().isChatPanelOpen).toBe(false)
	})

	it("closes panel immediately when beta is turned off", () => {
		const { store } = createTestWindow()

		store.commands.setChatPanelBetaEnabled(true)
		store.commands.setChatPanelOpen(true)
		expect(store.getSnapshot().isChatPanelOpen).toBe(true)

		store.commands.setChatPanelBetaEnabled(false)
		expect(store.getSnapshot().isChatPanelOpen).toBe(false)
	})
})
