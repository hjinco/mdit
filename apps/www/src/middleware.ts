import { defineMiddleware } from "astro:middleware"
import { DEFAULT_LOCALE, LOCALES } from "./i18n/locales"
import { normalizePath, toLocalePath } from "./i18n/paths"

const ENABLE_BROWSER_LANGUAGE_REDIRECT = false
const TARGET_PATHS = new Set(["/", "/blog", "/changelog"])
const ACTIVE_LOCALES = new Set<string>(LOCALES)

function mapBrowserLanguageToLocale(languageTag: string): string | null {
	const normalizedTag = languageTag.toLowerCase().replaceAll("_", "-")

	if (normalizedTag === "ko" || normalizedTag.startsWith("ko-")) {
		return "ko"
	}

	if (
		normalizedTag === "ch-zn" ||
		normalizedTag.startsWith("ch-zn-") ||
		normalizedTag === "zh-cn" ||
		normalizedTag.startsWith("zh-cn-")
	) {
		return "ch-zn"
	}

	return null
}

function getPreferredRedirectLocale(
	acceptLanguageHeader: string | null,
): string | null {
	if (!acceptLanguageHeader) {
		return null
	}

	const languageTags = acceptLanguageHeader
		.split(",")
		.map((part) => part.split(";")[0]?.trim())
		.filter((part): part is string => Boolean(part))

	for (const languageTag of languageTags) {
		const locale = mapBrowserLanguageToLocale(languageTag)

		if (locale) {
			return locale
		}
	}

	return null
}

export const onRequest = defineMiddleware(async (context, next) => {
	if (!ENABLE_BROWSER_LANGUAGE_REDIRECT) {
		return next()
	}

	const pathname = normalizePath(context.url.pathname)

	if (!TARGET_PATHS.has(pathname)) {
		return next()
	}

	const preferredLocale = getPreferredRedirectLocale(
		context.request.headers.get("accept-language"),
	)

	if (
		!preferredLocale ||
		preferredLocale === DEFAULT_LOCALE ||
		!ACTIVE_LOCALES.has(preferredLocale)
	) {
		return next()
	}

	const redirectPath = toLocalePath(preferredLocale, pathname)

	if (redirectPath === pathname) {
		return next()
	}

	return context.redirect(redirectPath, 302)
})
