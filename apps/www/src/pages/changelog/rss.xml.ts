import type { APIRoute } from "astro"
import { DEFAULT_LOCALE } from "../../i18n/locales"
import { getChangelogEntries } from "../../lib/content/queries"
import { buildRssXml } from "../../lib/content/rss"
import { SITE_TITLE, SITE_URL } from "../../lib/site/consts"

export const GET: APIRoute = async (context) => {
	const entries = await getChangelogEntries({
		locale: DEFAULT_LOCALE,
		includeDraft: false,
	})

	const xml = buildRssXml({
		title: `${SITE_TITLE} Changelog`,
		description: "Mdit product updates sorted by date.",
		siteUrl: (context.site ?? new URL(SITE_URL)).toString(),
		items: entries.map((entry) => ({
			title: entry.title,
			description: entry.summary,
			pubDate: entry.date,
			link: `/changelog/${entry.slug}`,
		})),
	})

	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
		},
	})
}
