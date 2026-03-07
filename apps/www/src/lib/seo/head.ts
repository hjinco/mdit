import type { PageMetaInput } from "./meta"
import { resolvePageMeta } from "./meta"

export function buildPageHead(input: PageMetaInput = {}) {
	const meta = resolvePageMeta(input)

	const headMeta: Array<Record<string, string>> = [
		{ title: meta.title },
		{ name: "description", content: meta.description },
		{ property: "og:type", content: "website" },
		{ property: "og:title", content: meta.title },
		{ property: "og:description", content: meta.description },
		{ property: "og:url", content: meta.canonicalUrl },
		{ name: "twitter:card", content: "summary_large_image" },
		{ name: "twitter:title", content: meta.title },
		{ name: "twitter:description", content: meta.description },
	]

	if (meta.image) {
		headMeta.push({ property: "og:image", content: meta.image })
		headMeta.push({ name: "twitter:image", content: meta.image })
	}

	if (meta.noindex) {
		headMeta.push({ name: "robots", content: "noindex, nofollow" })
	}

	return {
		meta: headMeta,
		links: [{ rel: "canonical", href: meta.canonicalUrl }],
	}
}
