const TAG_SEGMENT_REGEX = /^[\p{L}\p{N}_-]+$/u
const TAG_BODY_CHAR_REGEX = /[\p{L}\p{N}_/-]/u
const INLINE_TAG_REGEX = /#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*/gu

export type InlineTagMatch = {
	value: string
	query: string
	start: number
	end: number
}

export type TagDecoratedRange = {
	anchor: {
		path: number[]
		offset: number
	}
	focus: {
		path: number[]
		offset: number
	}
	tag: true
	tagLabel: string
	tagQuery: string
}

export function normalizeTagValue(raw: string): string | null {
	let value = raw.trim()
	if (value.startsWith("#")) {
		value = value.slice(1)
	}

	value = value.trim().toLowerCase()
	if (!value) {
		return null
	}

	const segments = value.split("/")
	if (
		segments.length === 0 ||
		segments.some((segment) => !segment || !TAG_SEGMENT_REGEX.test(segment))
	) {
		return null
	}

	return segments.join("/")
}

export function normalizeTagQuery(raw: string): string | null {
	const normalized = normalizeTagValue(raw)
	return normalized ? `#${normalized}` : null
}

export function findInlineTagMatches(text: string): InlineTagMatch[] {
	if (!text.includes("#")) {
		return []
	}

	const matches: InlineTagMatch[] = []
	for (const candidate of text.matchAll(INLINE_TAG_REGEX)) {
		const value = candidate[0]
		const start = candidate.index ?? -1
		if (start < 0) {
			continue
		}

		const end = start + value.length
		const prevChar = start > 0 ? text[start - 1] : ""
		const nextChar = end < text.length ? text[end] : ""

		if (
			(prevChar && TAG_BODY_CHAR_REGEX.test(prevChar)) ||
			(nextChar && TAG_BODY_CHAR_REGEX.test(nextChar))
		) {
			continue
		}

		const query = normalizeTagQuery(value)
		if (!query) {
			continue
		}

		matches.push({
			value,
			query,
			start,
			end,
		})
	}

	return matches
}

export function createTagDecoratedRanges(
	text: string,
	path: number[],
): TagDecoratedRange[] {
	return findInlineTagMatches(text).map((match) => ({
		anchor: {
			path,
			offset: match.start,
		},
		focus: {
			path,
			offset: match.end,
		},
		tag: true,
		tagLabel: match.value,
		tagQuery: match.query,
	}))
}
