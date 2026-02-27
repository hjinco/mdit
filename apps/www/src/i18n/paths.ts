import { DEFAULT_LOCALE, type Locale } from "./locales"

function ensureLeadingSlash(path: string): string {
	return path.startsWith("/") ? path : `/${path}`
}

export function normalizePath(path: string): string {
	const withLeadingSlash = ensureLeadingSlash(path.trim())

	if (withLeadingSlash !== "/" && withLeadingSlash.endsWith("/")) {
		return withLeadingSlash.slice(0, -1)
	}

	return withLeadingSlash
}

export function toLocalePath(locale: Locale, path: string): string
export function toLocalePath(locale: string, path: string): string
export function toLocalePath(locale: string, path: string): string {
	const normalizedPath = normalizePath(path)

	if (locale === DEFAULT_LOCALE) {
		return normalizedPath
	}

	if (normalizedPath === "/") {
		return `/${locale}`
	}

	return `/${locale}${normalizedPath}`
}
