import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "../site/consts"

export interface PageMetaInput {
	title?: string
	description?: string
	image?: string
	canonicalPath?: string
	noindex?: boolean
}

export interface ResolvedPageMeta {
	title: string
	description: string
	image: string | null
	canonicalUrl: string
	noindex: boolean
}

function toAbsoluteUrl(url: string): string {
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return url
	}

	return new URL(url, SITE_URL).toString()
}

export function resolvePageMeta(input: PageMetaInput = {}): ResolvedPageMeta {
	const title = input.title ?? SITE_TITLE
	const description = input.description ?? SITE_DESCRIPTION
	const canonicalPath = input.canonicalPath ?? "/"
	const canonicalUrl = new URL(canonicalPath, SITE_URL).toString()

	return {
		title,
		description,
		image: input.image ? toAbsoluteUrl(input.image) : null,
		canonicalUrl,
		noindex: input.noindex ?? false,
	}
}
