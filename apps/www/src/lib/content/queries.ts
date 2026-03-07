import { DEFAULT_LOCALE, type Locale } from "../../i18n/locales"
import type { BlogPost, LegalPage } from "./mappers"

interface QueryOptions {
	locale?: Locale
	includeDraft?: boolean
}

interface GetBySlugOptions extends QueryOptions {
	slug: string
}

function resolveIncludeDraft(includeDraft?: boolean): boolean {
	if (typeof includeDraft === "boolean") {
		return includeDraft
	}

	return import.meta.env.DEV
}

export function getBlogPosts(options: QueryOptions = {}): BlogPost[] {
	void (options.locale ?? DEFAULT_LOCALE)
	void resolveIncludeDraft(options.includeDraft)

	return []
}

export function getBlogPostBySlug(
	options: GetBySlugOptions,
): BlogPost | undefined {
	const posts = getBlogPosts(options)
	return posts.find((post) => post.slug === options.slug)
}

export function getLegalPageBySlug(
	slug: string,
	locale: Locale = DEFAULT_LOCALE,
): LegalPage | undefined {
	void slug
	void locale

	return undefined
}
