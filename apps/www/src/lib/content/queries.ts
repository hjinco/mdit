import { getCollection } from "astro:content"
import { DEFAULT_LOCALE, type Locale } from "../../i18n/locales"
import {
	type BlogPost,
	type ChangelogEntry,
	mapBlogEntry,
	mapChangelogEntry,
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

export async function getBlogPosts(
	options: QueryOptions = {},
): Promise<BlogPost[]> {
	const locale = options.locale ?? DEFAULT_LOCALE
	const includeDraft = resolveIncludeDraft(options.includeDraft)
	const entries = await getCollection("blog")

	return entries
		.filter((entry) => entry.data.locale === locale)
		.filter((entry) => includeDraft || !entry.data.draft)
		.map(mapBlogEntry)
		.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
}

export async function getBlogPostBySlug(
	options: GetBySlugOptions,
): Promise<BlogPost | undefined> {
	const posts = await getBlogPosts(options)
	return posts.find((post) => post.slug === options.slug)
}

export async function getChangelogEntries(
	options: QueryOptions = {},
): Promise<ChangelogEntry[]> {
	const locale = options.locale ?? DEFAULT_LOCALE
	const includeDraft = resolveIncludeDraft(options.includeDraft)
	const entries = await getCollection("changelog")

	return entries
		.filter((entry) => entry.data.locale === locale)
		.filter((entry) => includeDraft || !entry.data.draft)
		.map(mapChangelogEntry)
		.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function getChangelogBySlug(
	options: GetBySlugOptions,
): Promise<ChangelogEntry | undefined> {
	const entries = await getChangelogEntries(options)
	return entries.find((entry) => entry.slug === options.slug)
}
