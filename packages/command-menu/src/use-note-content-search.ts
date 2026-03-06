import { useEffect, useMemo, useRef, useState } from "react"
import type { CommandMenuContentMatch, CommandMenuContentSearch } from "./types"

const SNIPPET_CONTEXT_CHARS = 40
const MAX_SNIPPET_LENGTH = 160

export type ContentMatchWithSnippet = CommandMenuContentMatch & {
	snippet: string
}

export type ContentMatchGroup = {
	path: string
	matches: ContentMatchWithSnippet[]
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()

export const createSnippetFromLine = (line: string, query: string) => {
	const normalizedLine = normalizeWhitespace(line)
	if (!normalizedLine) {
		return ""
	}

	const lowerLine = normalizedLine.toLowerCase()
	const lowerQuery = query.toLowerCase()
	const firstMatchIndex = lowerLine.indexOf(lowerQuery)

	if (firstMatchIndex === -1) {
		if (normalizedLine.length <= MAX_SNIPPET_LENGTH) {
			return normalizedLine
		}

		return `${normalizedLine.slice(0, MAX_SNIPPET_LENGTH)}...`
	}

	const start = Math.max(0, firstMatchIndex - SNIPPET_CONTEXT_CHARS)
	const end = Math.min(
		normalizedLine.length,
		firstMatchIndex + lowerQuery.length + SNIPPET_CONTEXT_CHARS,
	)

	let snippet = normalizedLine.slice(start, end)
	if (start > 0) {
		snippet = `...${snippet}`
	}
	if (end < normalizedLine.length) {
		snippet = `${snippet}...`
	}

	return snippet
}

export const groupContentMatches = (
	matches: CommandMenuContentMatch[],
	trimmedSearchTerm: string,
) => {
	if (!trimmedSearchTerm) {
		return []
	}

	const groups: ContentMatchGroup[] = []
	const byPath = new Map<string, ContentMatchGroup>()

	for (const match of matches) {
		const matchWithSnippet: ContentMatchWithSnippet = {
			...match,
			snippet: createSnippetFromLine(match.lineText, trimmedSearchTerm),
		}

		let group = byPath.get(match.path)
		if (!group) {
			group = { path: match.path, matches: [] }
			byPath.set(match.path, group)
			groups.push(group)
		}

		group.matches.push(matchWithSnippet)
	}

	return groups
}

export const useNoteContentSearch = (
	query: string,
	workspacePath: string | null,
	searchContent?: CommandMenuContentSearch,
) => {
	const [contentMatches, setContentMatches] = useState<
		CommandMenuContentMatch[]
	>([])
	const latestRequestIdRef = useRef(0)

	const trimmedSearchTerm = query.trim()

	useEffect(() => {
		const requestId = latestRequestIdRef.current + 1
		latestRequestIdRef.current = requestId

		if (!searchContent || !workspacePath || trimmedSearchTerm.length === 0) {
			setContentMatches([])
			return
		}

		searchContent(trimmedSearchTerm, workspacePath)
			.then((results) => {
				if (latestRequestIdRef.current === requestId) {
					setContentMatches(results)
				}
			})
			.catch((error) => {
				if (latestRequestIdRef.current === requestId) {
					console.error("Failed to search note contents:", error)
					setContentMatches([])
				}
			})
	}, [searchContent, trimmedSearchTerm, workspacePath])

	const contentMatchesByNote = useMemo(
		() => groupContentMatches(contentMatches, trimmedSearchTerm),
		[contentMatches, trimmedSearchTerm],
	)

	return {
		trimmedSearchTerm,
		contentMatchesByNote,
	}
}
