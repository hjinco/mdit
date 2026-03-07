import { type Dictionary, enDictionary } from "./dictionary/en"
import { DEFAULT_LOCALE, type Locale } from "./locales"

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
	switch (locale) {
		default:
			return enDictionary
	}
}
