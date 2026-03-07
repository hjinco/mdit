import type { ContentHeading } from "./markdown"

type Locale = "en"

interface BlogPostCollectionEntry {
	slug: string
	title: string
	description: string
	publishedAt: Date | string
	updatedAt?: Date | string
	tags: string[]
	draft: boolean
	locale: Locale
	content: string
	html: string
	headings: ContentHeading[]
}

interface LegalPageCollectionEntry {
	slug: string
	title: string
	description: string
	effectiveDate: string
	locale: Locale
	content: string
	html: string
	headings: ContentHeading[]
}

export interface BlogPost {
	slug: string
	title: string
	description: string
	publishedAt: Date
	updatedAt?: Date
	tags: string[]
	locale: Locale
	content: string
	html: string
	headings: ContentHeading[]
}

export interface LegalPage {
	slug: string
	title: string
	description: string
	effectiveDate: string
	locale: Locale
	content: string
	html: string
	headings: ContentHeading[]
}

function toDate(value: Date | string): Date {
	if (value instanceof Date) {
		return value
	}

	return new Date(value)
}

export function mapBlogEntry(entry: BlogPostCollectionEntry): BlogPost {
	return {
		slug: entry.slug,
		title: entry.title,
		description: entry.description,
		publishedAt: toDate(entry.publishedAt),
		updatedAt: entry.updatedAt ? toDate(entry.updatedAt) : undefined,
		tags: entry.tags,
		locale: entry.locale,
		content: entry.content,
		html: entry.html,
		headings: entry.headings,
	}
}

export function mapLegalEntry(entry: LegalPageCollectionEntry): LegalPage {
	return {
		slug: entry.slug,
		title: entry.title,
		description: entry.description,
		effectiveDate: entry.effectiveDate,
		locale: entry.locale,
		content: entry.content,
		html: entry.html,
		headings: entry.headings,
	}
}
