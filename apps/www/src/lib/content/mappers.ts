import type { CollectionEntry } from "astro:content"

export interface BlogPost {
	slug: string
	title: string
	description: string
	publishedAt: Date
	updatedAt?: Date
	tags: string[]
	locale: "en"
	entry: CollectionEntry<"blog">
}

export type ChangelogType = "feature" | "improvement" | "fix"

export interface ChangelogEntry {
	slug: string
	title: string
	summary: string
	date: Date
	type: ChangelogType
	version?: string
	locale: "en"
	entry: CollectionEntry<"changelog">
}

function normalizeSlug(value: string): string {
	const parts = value.split("/")
	const normalized = parts.at(-1)

	return normalized ?? value
}

export function mapBlogEntry(entry: CollectionEntry<"blog">): BlogPost {
	return {
		slug: normalizeSlug(entry.slug),
		title: entry.data.title,
		description: entry.data.description,
		publishedAt: entry.data.publishedAt,
		updatedAt: entry.data.updatedAt,
		tags: entry.data.tags,
		locale: entry.data.locale,
		entry,
	}
}

export function mapChangelogEntry(
	entry: CollectionEntry<"changelog">,
): ChangelogEntry {
	return {
		slug: normalizeSlug(entry.slug),
		title: entry.data.title,
		summary: entry.data.summary,
		date: entry.data.date,
		type: entry.data.type,
		version: entry.data.version,
		locale: entry.data.locale,
		entry,
	}
}
