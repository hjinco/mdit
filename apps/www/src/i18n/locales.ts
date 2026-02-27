export const LOCALES = ["en"] as const
export const BROWSER_REDIRECT_LOCALES = ["ko", "ch-zn"] as const

export type Locale = (typeof LOCALES)[number]
export type BrowserRedirectLocale = (typeof BROWSER_REDIRECT_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

export function isLocale(value: string): value is Locale {
	return LOCALES.includes(value as Locale)
}
