import { type Dictionary, enDictionary } from "./dictionary/en"
import { DEFAULT_LOCALE, type Locale } from "./locales"

export async function getDictionary(
	locale: Locale = DEFAULT_LOCALE,
): Promise<Dictionary> {
	switch (locale) {
		default:
			return enDictionary
	}
}
