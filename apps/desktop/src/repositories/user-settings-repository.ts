export const FONT_SCALE_STORAGE_KEY = "font-scale"
export const DEFAULT_FONT_SCALE = 1
export const LOCAL_API_ENABLED_STORAGE_KEY = "local-api-enabled"
const MIN_FONT_SCALE = 0.8
const MAX_FONT_SCALE = 1.6
const FONT_SCALE_STEP = 0.1

const clampFontScale = (value: number) =>
	Math.min(
		MAX_FONT_SCALE,
		Math.max(MIN_FONT_SCALE, Math.round(value * 100) / 100),
	)

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

const saveFontScale = (value: number): void => {
	if (typeof window === "undefined") return
	localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(value))
}

const readLocalApiEnabled = (): boolean => {
	if (typeof window === "undefined") return true

	const storedValue = localStorage.getItem(LOCAL_API_ENABLED_STORAGE_KEY)
	if (storedValue === null) {
		return true
	}

	return storedValue === "true"
}

const saveLocalApiEnabled = (enabled: boolean): void => {
	if (typeof window === "undefined") return
	localStorage.setItem(LOCAL_API_ENABLED_STORAGE_KEY, String(enabled))
}

export class UserSettingsRepository {
	getFontScale(): number {
		return readFontScale()
	}

	setFontScale(value: number): number {
		const clampedValue = clampFontScale(value)
		saveFontScale(clampedValue)
		return clampedValue
	}

	increaseFontScale(currentValue: number): number {
		const newValue = clampFontScale(currentValue + FONT_SCALE_STEP)
		saveFontScale(newValue)
		return newValue
	}

	decreaseFontScale(currentValue: number): number {
		const newValue = clampFontScale(currentValue - FONT_SCALE_STEP)
		saveFontScale(newValue)
		return newValue
	}

	resetFontScale(): number {
		saveFontScale(DEFAULT_FONT_SCALE)
		return DEFAULT_FONT_SCALE
	}

	getLocalApiEnabled(): boolean {
		return readLocalApiEnabled()
	}

	setLocalApiEnabled(enabled: boolean): boolean {
		saveLocalApiEnabled(enabled)
		return enabled
	}
}
