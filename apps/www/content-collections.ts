import { defineCollection, defineConfig } from "@content-collections/core"
import matter from "gray-matter"
import { z } from "zod"
import { renderMarkdown } from "./src/lib/content/markdown"

const localeSchema = z.literal("en")

function normalizeSlug(value: string): string {
	const parts = value.split("/")
	const normalized = parts.at(-1)

	return normalized ?? value
}

const blogPosts = defineCollection({
	name: "blogPosts",
	directory: "src/content/blog",
	include: "**/*.md",
	schema: z.object({
		title: z.string(),
		description: z.string(),
		publishedAt: z.coerce.date(),
		updatedAt: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
		locale: localeSchema,
		content: z.string(),
	}),
	transform: async ({ content, ...entry }) => {
		const { content: body } = matter(content)
		const { html, headings } = await renderMarkdown(body)

		return {
			...entry,
			slug: normalizeSlug(entry._meta.path),
			content: body,
			html,
			headings,
		}
	},
})

const legalPages = defineCollection({
	name: "legalPages",
	directory: "src/content/legal",
	include: "**/*.md",
	schema: z.object({
		title: z.string(),
		description: z.string(),
		effectiveDate: z.string(),
		locale: localeSchema,
		content: z.string(),
	}),
	transform: async ({ content, ...entry }) => {
		const { content: body } = matter(content)
		const { html, headings } = await renderMarkdown(body)

		return {
			...entry,
			slug: normalizeSlug(entry._meta.path),
			content: body,
			html,
			headings,
		}
	},
})

export default defineConfig({
	content: [blogPosts, legalPages],
} as any)
