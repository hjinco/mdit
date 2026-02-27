import type { APIRoute } from "astro"
import { DEFAULT_LOCALE } from "../i18n/locales"
import { getBlogPosts } from "../lib/content/queries"
import { buildRssXml } from "../lib/content/rss"
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "../lib/site/consts"

export const GET: APIRoute = async (context) => {
	const posts = await getBlogPosts({
		locale: DEFAULT_LOCALE,
		includeDraft: false,
	})

	const xml = buildRssXml({
		title: `${SITE_TITLE} Blog`,
		description: SITE_DESCRIPTION,
		siteUrl: (context.site ?? new URL(SITE_URL)).toString(),
		items: posts.map((post) => ({
			title: post.title,
			description: post.description,
			pubDate: post.publishedAt,
			link: `/blog/${post.slug}`,
		})),
	})

	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
		},
	})
}
