interface RssItem {
	title: string
	description: string
	link: string
	pubDate: Date
}

interface BuildRssXmlInput {
	title: string
	description: string
	siteUrl: string
	items: RssItem[]
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
}

export function buildRssXml(input: BuildRssXmlInput): string {
	const normalizedSiteUrl = input.siteUrl.replace(/\/$/, "")

	const itemXml = input.items
		.map((item) => {
			const url = `${normalizedSiteUrl}${item.link}`

			return [
				"<item>",
				`<title>${escapeXml(item.title)}</title>`,
				`<description>${escapeXml(item.description)}</description>`,
				`<link>${escapeXml(url)}</link>`,
				`<guid>${escapeXml(url)}</guid>`,
				`<pubDate>${item.pubDate.toUTCString()}</pubDate>`,
				"</item>",
			].join("")
		})
		.join("")

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0">',
		"<channel>",
		`<title>${escapeXml(input.title)}</title>`,
		`<description>${escapeXml(input.description)}</description>`,
		`<link>${escapeXml(normalizedSiteUrl)}</link>`,
		itemXml,
		"</channel>",
		"</rss>",
	].join("")
}
