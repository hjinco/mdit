import { createFileRoute } from "@tanstack/react-router"
import { DEFAULT_LOCALE } from "../i18n/locales"
import { getBlogPosts } from "../lib/content/queries"
import { buildRssXml } from "../lib/content/rss"
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "../lib/site/consts"

export const Route = createFileRoute("/rss.xml")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const posts = getBlogPosts({
					locale: DEFAULT_LOCALE,
					includeDraft: false,
				})

				const siteUrl = new URL(request.url).origin || SITE_URL
				const xml = buildRssXml({
					title: `${SITE_TITLE} Blog`,
					description: SITE_DESCRIPTION,
					siteUrl,
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
			},
		},
	},
})
