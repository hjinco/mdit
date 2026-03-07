import { allBlogPosts, allLegalPages } from "content-collections"
import { DEFAULT_LOCALE, type Locale } from "../../i18n/locales"
import {
	type BlogPost,
	type LegalPage,
	mapBlogEntry,
	mapLegalEntry,
} from "./mappers"

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
	const locale = options.locale ?? DEFAULT_LOCALE
	const includeDraft = resolveIncludeDraft(options.includeDraft)

	return allBlogPosts
		.filter((entry) => entry.locale === locale)
		.filter((entry) => includeDraft || !entry.draft)
		.map(mapBlogEntry)
		.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
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
	return allLegalPages
		.filter((entry) => entry.locale === locale)
		.map(mapLegalEntry)
		.find((page) => page.slug === slug)
}
