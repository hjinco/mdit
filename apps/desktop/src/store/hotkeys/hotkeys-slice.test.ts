import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import { createDefaultAppHotkeys } from "@/lib/hotkeys"
import {
	type HotkeyStorage,
	type HotkeysSlice,
	prepareHotkeysSlice,
} from "./hotkeys-slice"

const createHotkeysStore = (storage: HotkeyStorage) => {
	const createSlice = prepareHotkeysSlice({ storage })
	return createStore<HotkeysSlice>()((set, get, api) =>
		createSlice(set, get, api),
	)
}

describe("hotkeys-slice", () => {
	let persistedBindings = createDefaultAppHotkeys()
	let storage: HotkeyStorage

	beforeEach(() => {
		persistedBindings = createDefaultAppHotkeys()
		storage = {
			load: vi.fn(async () => persistedBindings),
			save: vi.fn(async (bindings) => {
				persistedBindings = { ...bindings }
			}),
			reset: vi.fn(async () => {
				persistedBindings = createDefaultAppHotkeys()
			}),
		}
	})

	it("loads hotkeys from injected storage", async () => {
		persistedBindings = {
			...persistedBindings,
			"open-command-menu": "Mod+P",
		}
		const store = createHotkeysStore(storage)

		await store.getState().initializeHotkeys()

		expect(store.getState().isHotkeysLoaded).toBe(true)
		expect(store.getState().hotkeys["open-command-menu"]).toBe("Mod+P")
		expect(storage.load).toHaveBeenCalledTimes(1)
	})

	it("falls back to default hotkeys when storage returns null", async () => {
		storage.load = vi.fn(async () => null)
		const store = createHotkeysStore(storage)

		await store.getState().initializeHotkeys()

		expect(store.getState().isHotkeysLoaded).toBe(true)
		expect(store.getState().hotkeys).toEqual(createDefaultAppHotkeys())
	})

	it("updates hotkey binding and persists it", async () => {
		const store = createHotkeysStore(storage)

		const result = await store
			.getState()
			.setHotkeyBinding("open-command-menu", "mod+p")

		expect(result).toEqual({ success: true })
		expect(store.getState().hotkeys["open-command-menu"]).toBe("Mod+P")
		expect(storage.save).toHaveBeenCalledTimes(1)
	})

	it("rejects conflicting hotkeys", async () => {
		const store = createHotkeysStore(storage)

		const result = await store
			.getState()
			.setHotkeyBinding("create-note", "Mod+O")

		expect(result.success).toBe(false)
		expect(result.conflictWith).toBe("open-folder")
		expect(storage.save).not.toHaveBeenCalled()
	})

	it("allows unassigned hotkeys", async () => {
		const store = createHotkeysStore(storage)

		const result = await store.getState().setHotkeyBinding("open-folder", "")

		expect(result).toEqual({ success: true })
		expect(store.getState().hotkeys["open-folder"]).toBe("")
		expect(storage.save).toHaveBeenCalledTimes(1)
	})

	it("resets hotkeys through storage", async () => {
		const store = createHotkeysStore(storage)

		await store.getState().setHotkeyBinding("open-command-menu", "Mod+P")
		await store.getState().resetHotkeyBindings()

		expect(storage.reset).toHaveBeenCalledTimes(1)
		expect(store.getState().hotkeys).toEqual(createDefaultAppHotkeys())
	})

	it("returns error when storage save fails", async () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		storage.save = vi.fn(async () => {
			throw new Error("disk error")
		})
		const store = createHotkeysStore(storage)

		const result = await store
			.getState()
			.setHotkeyBinding("open-command-menu", "Mod+P")

		expect(result.success).toBe(false)
		expect(result.error).toBe("disk error")
		expect(store.getState().hotkeys["open-command-menu"]).toBe("Mod+K")
		consoleErrorSpy.mockRestore()
	})
})
