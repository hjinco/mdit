import { beforeEach, describe, expect, it } from "vitest"
import { createStore } from "zustand/vanilla"
import {
	LOCAL_API_ENABLED_STORAGE_KEY,
	UserSettingsRepository,
} from "../../repositories/user-settings-repository"
import { prepareUISlice, type UISlice } from "./ui-slice"

type LocalStorageLike = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem" | "clear" | "key"
> & {
	length: number
}

const ensureLocalStorage = () => {
	if (typeof globalThis.window === "undefined") {
		Object.defineProperty(globalThis, "window", {
			value: globalThis,
			configurable: true,
		})
	}

	if (typeof globalThis.localStorage !== "undefined") return

	const store = new Map<string, string>()
	const localStorageShim: LocalStorageLike = {
		getItem: (key) => (store.has(key) ? store.get(key)! : null),
		setItem: (key, value) => {
			store.set(key, String(value))
		},
		removeItem: (key) => {
			store.delete(key)
		},
		clear: () => {
			store.clear()
		},
		key: (index) => Array.from(store.keys())[index] ?? null,
		get length() {
			return store.size
		},
	}

	globalThis.localStorage = localStorageShim as Storage
}

const createUISliceStore = () => {
	const createSlice = prepareUISlice({
		userSettingsRepository: new UserSettingsRepository(),
	})
	return createStore<UISlice>()((set, get, api) => createSlice(set, get, api))
}

beforeEach(() => {
	ensureLocalStorage()
	localStorage.clear()
})

describe("ui-slice local api settings", () => {
	it("defaults localApiEnabled to true when no persisted value exists", () => {
		const store = createUISliceStore()

		expect(store.getState().localApiEnabled).toBe(true)
	})

	it("persists localApiEnabled changes to localStorage", () => {
		const store = createUISliceStore()

		store.getState().setLocalApiEnabled(false)

		expect(store.getState().localApiEnabled).toBe(false)
		expect(localStorage.getItem(LOCAL_API_ENABLED_STORAGE_KEY)).toBe("false")

		const rehydratedStore = createUISliceStore()
		expect(rehydratedStore.getState().localApiEnabled).toBe(false)
	})

	it("sets and clears localApiError", () => {
		const store = createUISliceStore()

		store.getState().setLocalApiError("error message")
		expect(store.getState().localApiError).toBe("error message")

		store.getState().setLocalApiError(null)
		expect(store.getState().localApiError).toBeNull()
	})
})

describe("ui-slice note info panel", () => {
	it("defaults isNoteInfoOpen to false", () => {
		const store = createUISliceStore()

		expect(store.getState().isNoteInfoOpen).toBe(false)
	})

	it("sets note info panel open state directly", () => {
		const store = createUISliceStore()

		store.getState().setNoteInfoOpen(true)
		expect(store.getState().isNoteInfoOpen).toBe(true)

		store.getState().setNoteInfoOpen(false)
		expect(store.getState().isNoteInfoOpen).toBe(false)
	})

	it("toggles note info panel open state", () => {
		const store = createUISliceStore()

		store.getState().toggleNoteInfoOpen()
		expect(store.getState().isNoteInfoOpen).toBe(true)

		store.getState().toggleNoteInfoOpen()
		expect(store.getState().isNoteInfoOpen).toBe(false)
	})
})
