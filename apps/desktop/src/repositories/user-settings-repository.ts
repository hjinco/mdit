import type { UIPreferences } from "@mdit/store/core"

export const FILE_EXPLORER_STORAGE_KEY = "isFileExplorerOpen"
export const FONT_SCALE_STORAGE_KEY = "font-scale"
export const DEFAULT_FONT_SCALE = 1
export const LOCAL_API_ENABLED_STORAGE_KEY = "local-api-enabled"
export const CHAT_PANEL_BETA_ENABLED_STORAGE_KEY = "chat-panel-beta-enabled"
const MIN_FONT_SCALE = 0.8
const MAX_FONT_SCALE = 1.6
const FONT_SCALE_STEP = 0.1

const clampFontScale = (value: number) =>
	Math.min(
		MAX_FONT_SCALE,
		Math.max(MIN_FONT_SCALE, Math.round(value * 100) / 100),
	)

const readStorageBoolean = (key: string, defaultValue: boolean): boolean => {
	if (typeof window === "undefined") return defaultValue

	const stored = localStorage.getItem(key)
	return stored === null ? defaultValue : stored === "true"
}

const saveStorageBoolean = (key: string, value: boolean): boolean => {
	if (typeof window !== "undefined") {
		localStorage.setItem(key, String(value))
	}
	return value
}

const readFontScale = (): number => {
	if (typeof window === "undefined") return DEFAULT_FONT_SCALE

	const storedValue = localStorage.getItem(FONT_SCALE_STORAGE_KEY)
	if (!storedValue) return DEFAULT_FONT_SCALE

	const parsed = Number.parseFloat(storedValue)
	if (!Number.isFinite(parsed)) {
		localStorage.removeItem(FONT_SCALE_STORAGE_KEY)
		return DEFAULT_FONT_SCALE
	}

	return clampFontScale(parsed)
}

const saveFontScale = (value: number): number => {
	const clampedValue = clampFontScale(value)
	if (typeof window !== "undefined") {
		localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(clampedValue))
	}
	return clampedValue
}

export class UserSettingsRepository implements UIPreferences {
	getFileExplorerOpen(): boolean {
		return readStorageBoolean(FILE_EXPLORER_STORAGE_KEY, true)
	}

	setFileExplorerOpen(isOpen: boolean): boolean {
		return saveStorageBoolean(FILE_EXPLORER_STORAGE_KEY, isOpen)
	}

	getFontScale(): number {
		return readFontScale()
	}

	setFontScale(value: number): number {
		return saveFontScale(value)
	}

	increaseFontScale(currentValue: number): number {
		return saveFontScale(currentValue + FONT_SCALE_STEP)
	}

	decreaseFontScale(currentValue: number): number {
		return saveFontScale(currentValue - FONT_SCALE_STEP)
	}

	resetFontScale(): number {
		return saveFontScale(DEFAULT_FONT_SCALE)
	}

	getLocalApiEnabled(): boolean {
		return readStorageBoolean(LOCAL_API_ENABLED_STORAGE_KEY, false)
	}

	setLocalApiEnabled(enabled: boolean): boolean {
		return saveStorageBoolean(LOCAL_API_ENABLED_STORAGE_KEY, enabled)
	}

	getChatPanelBetaEnabled(): boolean {
		return readStorageBoolean(CHAT_PANEL_BETA_ENABLED_STORAGE_KEY, false)
	}

	setChatPanelBetaEnabled(enabled: boolean): boolean {
		return saveStorageBoolean(CHAT_PANEL_BETA_ENABLED_STORAGE_KEY, enabled)
	}
}
