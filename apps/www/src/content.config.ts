import { defineCollection, z } from "astro:content"

const localeSchema = z.literal("en")

const blog = defineCollection({
	type: "content",
	schema: z.object({
		title: z.string(),
		description: z.string(),
		publishedAt: z.coerce.date(),
		updatedAt: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		draft: z.boolean().default(false),
		locale: localeSchema,
	}),
})

const changelog = defineCollection({
	type: "content",
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		summary: z.string(),
		type: z.enum(["feature", "improvement", "fix"]),
		version: z.string().optional(),
		draft: z.boolean().default(false),
		locale: localeSchema,
	}),
})

export const collections = {
	blog,
	changelog,
}
