import { validateHotkey } from "@tanstack/react-hotkeys"
import { BaseDirectory } from "@tauri-apps/api/path"
import {
	exists,
	mkdir,
	readTextFile,
	writeTextFile,
} from "@tauri-apps/plugin-fs"
import type { StateCreator } from "zustand"
import {
	type AppHotkeyActionId,
	type AppHotkeyMap,
	createDefaultAppHotkeys,
	findHotkeyConflict,
	isAppHotkeyActionId,
	mergeWithDefaultHotkeys,
	normalizeHotkeyBinding,
} from "@/lib/hotkeys"

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
	initializeHotkeys: () => Promise<void>
	setHotkeyBinding: (
		actionId: AppHotkeyActionId,
		combo: string,
	) => Promise<SetHotkeyBindingResult>
	resetHotkeyBindings: () => Promise<void>
}

type HotkeysSliceDependencies = {
	storage: HotkeyStorage
}

const HOTKEY_SETTINGS_DIR = "settings"
const HOTKEY_SETTINGS_FILE = "settings/hotkeys.json"
const HOTKEY_SETTINGS_VERSION = 1

const createAppDataHotkeyStorage = (): HotkeyStorage => ({
	load: async () => {
		try {
			const hasFile = await exists(HOTKEY_SETTINGS_FILE, {
				baseDir: BaseDirectory.AppData,
			})
			if (!hasFile) {
				return null
			}

			const raw = await readTextFile(HOTKEY_SETTINGS_FILE, {
				baseDir: BaseDirectory.AppData,
			})
			const parsed = JSON.parse(raw) as unknown
			if (typeof parsed !== "object" || parsed === null) {
				return null
			}

			const maybeRecord = parsed as { bindings?: unknown }
			if (
				typeof maybeRecord.bindings !== "object" ||
				maybeRecord.bindings === null
			) {
				return null
			}

			const rawBindings = maybeRecord.bindings as Record<string, unknown>
			const normalizedBindings: Partial<Record<AppHotkeyActionId, unknown>> = {}

			for (const [key, value] of Object.entries(rawBindings)) {
				if (isAppHotkeyActionId(key)) {
					normalizedBindings[key] = value
				}
			}

			return mergeWithDefaultHotkeys(normalizedBindings)
		} catch (error) {
			console.error("Failed to load hotkeys from AppData:", error)
			return null
		}
	},
	save: async (bindings) => {
		await mkdir(HOTKEY_SETTINGS_DIR, {
			recursive: true,
			baseDir: BaseDirectory.AppData,
		})

		await writeTextFile(
			HOTKEY_SETTINGS_FILE,
			JSON.stringify(
				{
					version: HOTKEY_SETTINGS_VERSION,
					bindings,
				},
				null,
				2,
			),
			{ baseDir: BaseDirectory.AppData },
		)
	},
	reset: async () => {
		const defaults = createDefaultAppHotkeys()
		await mkdir(HOTKEY_SETTINGS_DIR, {
			recursive: true,
			baseDir: BaseDirectory.AppData,
		})

		await writeTextFile(
			HOTKEY_SETTINGS_FILE,
			JSON.stringify(
				{
					version: HOTKEY_SETTINGS_VERSION,
					bindings: defaults,
				},
				null,
				2,
			),
			{ baseDir: BaseDirectory.AppData },
		)
	},
})

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

		initializeHotkeys: async () => {
			try {
				const loadedHotkeys = await storage.load()
				set({
					hotkeys: loadedHotkeys ?? createDefaultAppHotkeys(),
					isHotkeysLoaded: true,
				})
			} catch (error) {
				console.error("Failed to initialize hotkeys:", error)
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

export const createHotkeysSlice = prepareHotkeysSlice({
	storage: createAppDataHotkeyStorage(),
})
