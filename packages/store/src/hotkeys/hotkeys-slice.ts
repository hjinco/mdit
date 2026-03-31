import { validateHotkey } from "@tanstack/react-hotkeys"
import type { StateCreator } from "zustand"
import {
	type AppHotkeyActionId,
	type AppHotkeyMap,
	createDefaultAppHotkeys,
	findHotkeyConflict,
	normalizeHotkeyBinding,
} from "./hotkey-utils"

export type HotkeyStorage = {
	load: () => Promise<AppHotkeyMap | null>
	save: (bindings: AppHotkeyMap) => Promise<void>
	reset: () => Promise<void>
}

export type SetHotkeyBindingResult = {
	success: boolean
	conflictWith?: AppHotkeyActionId
	error?: string
}

export type HotkeysSlice = {
	hotkeys: AppHotkeyMap
	isHotkeysLoaded: boolean
	loadHotkeys: () => Promise<void>
	setHotkeyBinding: (
		actionId: AppHotkeyActionId,
		combo: string,
	) => Promise<SetHotkeyBindingResult>
	resetHotkeyBindings: () => Promise<void>
}

export type HotkeysSliceDependencies = {
	storage: HotkeyStorage
}

export const prepareHotkeysSlice =
	({
		storage,
	}: HotkeysSliceDependencies): StateCreator<
		HotkeysSlice,
		[],
		[],
		HotkeysSlice
	> =>
	(set, get) => ({
		hotkeys: createDefaultAppHotkeys(),
		isHotkeysLoaded: false,

		loadHotkeys: async () => {
			try {
				const loadedHotkeys = await storage.load()
				set({
					hotkeys: loadedHotkeys ?? createDefaultAppHotkeys(),
					isHotkeysLoaded: true,
				})
			} catch (error) {
				console.error("Failed to load hotkeys:", error)
				set({
					hotkeys: createDefaultAppHotkeys(),
					isHotkeysLoaded: true,
				})
			}
		},

		setHotkeyBinding: async (actionId, combo) => {
			const normalizedBinding = normalizeHotkeyBinding(combo)
			if (normalizedBinding) {
				const validationResult = validateHotkey(normalizedBinding)
				if (!validationResult.valid) {
					return {
						success: false,
						error: validationResult.errors[0] ?? "Invalid hotkey format",
					}
				}
			}

			const currentHotkeys = get().hotkeys
			const conflictWith = findHotkeyConflict(
				currentHotkeys,
				actionId,
				normalizedBinding,
			)
			if (conflictWith) {
				return {
					success: false,
					conflictWith,
					error: "Shortcut already assigned",
				}
			}

			const nextHotkeys: AppHotkeyMap = {
				...currentHotkeys,
				[actionId]: normalizedBinding,
			}

			try {
				await storage.save(nextHotkeys)
				set({ hotkeys: nextHotkeys })
				return { success: true }
			} catch (error) {
				console.error("Failed to save hotkey binding:", error)
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to save hotkey binding",
				}
			}
		},

		resetHotkeyBindings: async () => {
			try {
				await storage.reset()
				set({ hotkeys: createDefaultAppHotkeys() })
			} catch (error) {
				console.error("Failed to reset hotkeys:", error)
			}
		},
	})
