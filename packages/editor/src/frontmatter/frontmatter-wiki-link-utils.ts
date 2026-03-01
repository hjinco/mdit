export type FrontmatterWikiTextSegment = {
	type: "text"
	value: string
}

export type FrontmatterWikiLinkSegment = {
	type: "wikiLink"
	target: string
	label: string
}

export type FrontmatterWikiSegment =
	| FrontmatterWikiTextSegment
	| FrontmatterWikiLinkSegment

export type FrontmatterActiveWikiQuery = {
	start: number
	end: number
	query: string
}

function pushTextSegment(segments: FrontmatterWikiSegment[], value: string) {
	if (!value) return
	const last = segments.at(-1)
	if (last?.type === "text") {
		last.value += value
		return
	}
	segments.push({ type: "text", value })
}

function parseWikiToken(token: string): FrontmatterWikiLinkSegment | null {
	if (!token) return null

	const separatorIndex = token.indexOf("|")
	const hasAlias = separatorIndex >= 0
	const rawTarget = hasAlias ? token.slice(0, separatorIndex) : token
	const rawAlias = hasAlias ? token.slice(separatorIndex + 1) : ""

	const target = rawTarget.trim()
	if (!target) return null

	const alias = rawAlias.trim()
	return {
		type: "wikiLink",
		target,
		label: alias || target,
	}
}

export function parseFrontmatterWikiSegments(
	input: string,
): FrontmatterWikiSegment[] {
	if (!input) return [{ type: "text", value: "" }]

	const segments: FrontmatterWikiSegment[] = []
	let cursor = 0

	while (cursor < input.length) {
		const start = input.indexOf("[[", cursor)
		if (start < 0) {
			pushTextSegment(segments, input.slice(cursor))
			break
		}

		if (start > cursor) {
			pushTextSegment(segments, input.slice(cursor, start))
		}

		const end = input.indexOf("]]", start + 2)
		if (end < 0) {
			pushTextSegment(segments, input.slice(start))
			break
		}

		const token = input.slice(start + 2, end)
		const wiki = parseWikiToken(token)
		if (wiki) {
			segments.push(wiki)
		} else {
			pushTextSegment(segments, input.slice(start, end + 2))
		}
		cursor = end + 2
	}

	if (!segments.length) {
		return [{ type: "text", value: input }]
	}

	return segments
}

export function isSingleFrontmatterWikiLinkValue(input: string): boolean {
	if (!input) return false

	const segments = parseFrontmatterWikiSegments(input)
	return segments.length === 1 && segments[0]?.type === "wikiLink"
}

export function getActiveFrontmatterWikiQuery(
	value: string,
	cursorPosition: number,
): FrontmatterActiveWikiQuery | null {
	if (!value) return null
	if (cursorPosition < 0 || cursorPosition > value.length) return null

	const start = value.lastIndexOf("[[", cursorPosition)
	if (start < 0) return null
	if (cursorPosition < start + 2) return null

	const beforeCursor = value.slice(start + 2, cursorPosition)
	if (!beforeCursor) {
		return { start, end: cursorPosition, query: "" }
	}

	if (beforeCursor.includes("]]")) return null
	if (beforeCursor.includes("|")) return null
	if (beforeCursor.includes("\n")) return null

	const closeIndex = value.indexOf("]]", start + 2)
	if (closeIndex >= 0 && closeIndex < cursorPosition) return null

	return {
		start,
		end: cursorPosition,
		query: beforeCursor.trim(),
	}
}

export function replaceFrontmatterWikiQuery(
	value: string,
	query: FrontmatterActiveWikiQuery,
	target: string,
) {
	return `${value.slice(0, query.start)}[[${target}]]${value.slice(query.end)}`
}
