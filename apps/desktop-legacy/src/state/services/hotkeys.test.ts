import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	createDefaultAppHotkeys,
	createHotkeysService,
	type HotkeyStorage,
} from "./hotkeys"

const createHotkeysStore = (storage: HotkeyStorage) =>
	createHotkeysService({ storage })

describe("hotkeys service", () => {
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

		await store.commands.loadHotkeys()

		expect(store.getSnapshot().isHotkeysLoaded).toBe(true)
		expect(store.getSnapshot().hotkeys["open-command-menu"]).toBe("Mod+P")
		expect(storage.load).toHaveBeenCalledTimes(1)
	})

	it("falls back to default hotkeys when storage returns null", async () => {
		storage.load = vi.fn(async () => null)
		const store = createHotkeysStore(storage)

		await store.commands.loadHotkeys()

		expect(store.getSnapshot().isHotkeysLoaded).toBe(true)
		expect(store.getSnapshot().hotkeys).toEqual(createDefaultAppHotkeys())
		expect(store.getSnapshot().hotkeys["toggle-note-info"]).toBe("Mod+Shift+I")
		expect(store.getSnapshot().hotkeys["toggle-chat-panel"]).toBe("Mod+Shift+L")
	})

	it("updates hotkey binding and persists it", async () => {
		const store = createHotkeysStore(storage)

		const result = await store.commands.setHotkeyBinding(
			"open-command-menu",
			"mod+p",
		)

		expect(result).toEqual({ success: true })
		expect(store.getSnapshot().hotkeys["open-command-menu"]).toBe("Mod+P")
		expect(storage.save).toHaveBeenCalledTimes(1)
	})

	it("applies concurrent updates to the same persisted bindings", async () => {
		const store = createHotkeysStore(storage)

		await Promise.all([
			store.commands.setHotkeyBinding("open-command-menu", "Mod+P"),
			store.commands.setHotkeyBinding("open-folder", ""),
		])

		expect(persistedBindings).toMatchObject({
			"open-command-menu": "Mod+P",
			"open-folder": "",
		})
	})

	it("rejects conflicting hotkeys", async () => {
		const store = createHotkeysStore(storage)

		const result = await store.commands.setHotkeyBinding(
			"create-note",
			"Mod+Shift+I",
		)

		expect(result.success).toBe(false)
		expect(result.conflictWith).toBe("toggle-note-info")
		expect(storage.save).not.toHaveBeenCalled()
	})

	it("rejects fixed tab shortcut bindings", async () => {
		const store = createHotkeysStore(storage)

		const result = await store.commands.setHotkeyBinding("create-note", "mod+1")

		expect(result.success).toBe(false)
		expect(result.error).toBe("Shortcut is reserved for tab switching")
		expect(storage.save).not.toHaveBeenCalled()
	})

	it("allows unassigned hotkeys", async () => {
		const store = createHotkeysStore(storage)

		const result = await store.commands.setHotkeyBinding("open-folder", "")

		expect(result).toEqual({ success: true })
		expect(store.getSnapshot().hotkeys["open-folder"]).toBe("")
		expect(storage.save).toHaveBeenCalledTimes(1)
	})

	it("resets hotkeys through storage", async () => {
		const store = createHotkeysStore(storage)

		await store.commands.setHotkeyBinding("open-command-menu", "Mod+P")
		await store.commands.resetHotkeyBindings()

		expect(storage.reset).toHaveBeenCalledTimes(1)
		expect(store.getSnapshot().hotkeys).toEqual(createDefaultAppHotkeys())
	})

	it("returns error when storage save fails", async () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		storage.save = vi.fn(async () => {
			throw new Error("disk error")
		})
		const store = createHotkeysStore(storage)

		const result = await store.commands.setHotkeyBinding(
			"open-command-menu",
			"Mod+P",
		)

		expect(result.success).toBe(false)
		expect(result.error).toBe("disk error")
		expect(store.getSnapshot().hotkeys["open-command-menu"]).toBe("Mod+K")
		consoleErrorSpy.mockRestore()
	})
})
