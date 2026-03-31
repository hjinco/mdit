import type { HotkeyStorage } from "@mdit/store/core"
import {
	type AppHotkeyActionId,
	createDefaultAppHotkeys,
	isAppHotkeyActionId,
	mergeWithDefaultHotkeys,
} from "@mdit/store/hotkeys"
import { BaseDirectory } from "@tauri-apps/api/path"
import {
	exists,
	mkdir,
	readTextFile,
	writeTextFile,
} from "@tauri-apps/plugin-fs"

const HOTKEY_SETTINGS_DIR = "settings"
const HOTKEY_SETTINGS_FILE = "settings/hotkeys.json"
const HOTKEY_SETTINGS_VERSION = 1

export const createAppDataHotkeyStorage = (): HotkeyStorage => ({
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
