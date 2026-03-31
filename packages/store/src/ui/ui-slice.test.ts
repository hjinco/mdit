import { describe, expect, it } from "vitest"
import { createStore } from "zustand/vanilla"
import { prepareUISlice, type UIPreferences, type UISlice } from "./ui-slice"

function createPreferencesState() {
	return {
		fileExplorerOpen: true,
		fontScale: 1,
		localApiEnabled: false,
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
		getLocalApiEnabled: () => state.localApiEnabled,
		setLocalApiEnabled: (enabled) => {
			state.localApiEnabled = enabled
			return enabled
		},
	}) satisfies UIPreferences

const createUISliceStore = (preferencesState = createPreferencesState()) => {
	const createSlice = prepareUISlice({
		preferences: createPreferences(preferencesState),
	})
	return {
		store: createStore<UISlice>()((set, get, api) =>
			createSlice(set, get, api),
		),
		preferencesState,
	}
}

describe("ui-slice local api settings", () => {
	it("defaults localApiEnabled to false when no persisted value exists", () => {
		const { store } = createUISliceStore()

		expect(store.getState().localApiEnabled).toBe(false)
	})

	it("persists localApiEnabled changes through injected preferences", () => {
		const { store, preferencesState } = createUISliceStore()

		store.getState().setLocalApiEnabled(false)

		expect(store.getState().localApiEnabled).toBe(false)
		expect(preferencesState.localApiEnabled).toBe(false)

		const { store: rehydratedStore } = createUISliceStore(preferencesState)
		expect(rehydratedStore.getState().localApiEnabled).toBe(false)
	})

	it("sets and clears localApiError", () => {
		const { store } = createUISliceStore()

		store.getState().setLocalApiError("error message")
		expect(store.getState().localApiError).toBe("error message")

		store.getState().setLocalApiError(null)
		expect(store.getState().localApiError).toBeNull()
	})
})

describe("ui-slice note info panel", () => {
	it("defaults isNoteInfoOpen to false", () => {
		const { store } = createUISliceStore()

		expect(store.getState().isNoteInfoOpen).toBe(false)
	})

	it("sets note info panel open state directly", () => {
		const { store } = createUISliceStore()

		store.getState().setNoteInfoOpen(true)
		expect(store.getState().isNoteInfoOpen).toBe(true)

		store.getState().setNoteInfoOpen(false)
		expect(store.getState().isNoteInfoOpen).toBe(false)
	})

	it("toggles note info panel open state", () => {
		const { store } = createUISliceStore()

		store.getState().toggleNoteInfoOpen()
		expect(store.getState().isNoteInfoOpen).toBe(true)

		store.getState().toggleNoteInfoOpen()
		expect(store.getState().isNoteInfoOpen).toBe(false)
	})
})

describe("ui-slice command menu seed query", () => {
	it("opens the command menu with a seeded query", () => {
		const { store } = createUISliceStore()

		store.getState().openCommandMenuWithQuery("#project/docs")

		expect(store.getState().isCommandMenuOpen).toBe(true)
		expect(store.getState().commandMenuInitialQuery).toBe("#project/docs")
	})

	it("clears the seeded query when the menu closes", () => {
		const { store } = createUISliceStore()

		store.getState().openCommandMenuWithQuery("#project")
		store.getState().closeCommandMenu()

		expect(store.getState().isCommandMenuOpen).toBe(false)
		expect(store.getState().commandMenuInitialQuery).toBeNull()
	})

	it("opens the command menu without a seed for normal entry", () => {
		const { store } = createUISliceStore()

		store.getState().openCommandMenuWithQuery("#project")
		store.getState().openCommandMenu()

		expect(store.getState().isCommandMenuOpen).toBe(true)
		expect(store.getState().commandMenuInitialQuery).toBeNull()
	})
})
