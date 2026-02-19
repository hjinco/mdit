import { useEffect, useMemo, useRef, useState } from "react"
import {
	type MarkdownContentMatch,
	searchMarkdownContent,
} from "../utils/note-content-search"

const SNIPPET_CONTEXT_CHARS = 40
const MAX_SNIPPET_LENGTH = 160

type ContentMatchWithSnippet = MarkdownContentMatch & {
	snippet: string
}

type ContentMatchGroup = {
	path: string
	matches: ContentMatchWithSnippet[]
}

// Collapse any whitespace so snippets look tidy inside the command palette.
const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()

// Build a short snippet that surrounds the first occurrence of the query.
const createSnippetFromLine = (line: string, query: string) => {
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

export const useNoteContentSearch = (
	query: string,
	workspacePath: string | null,
) => {
	const [contentMatches, setContentMatches] = useState<MarkdownContentMatch[]>(
		[],
	)
	const latestRequestIdRef = useRef(0)

	const trimmedSearchTerm = query.trim()

	// Kick off a file-content search and guard against race conditions when queries change quickly.
	useEffect(() => {
		const requestId = latestRequestIdRef.current + 1
		latestRequestIdRef.current = requestId

		if (!workspacePath || trimmedSearchTerm.length === 0) {
			setContentMatches([])
			return
		}

		searchMarkdownContent(trimmedSearchTerm, workspacePath)
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
	}, [trimmedSearchTerm, workspacePath])

	// Attach friendly snippets while memoising the transformation for performance.
	const contentMatchesWithSnippet = useMemo<ContentMatchWithSnippet[]>(() => {
		if (trimmedSearchTerm.length === 0) {
			return []
		}

		return contentMatches.map((match) => ({
			...match,
			snippet: createSnippetFromLine(match.lineText, trimmedSearchTerm),
		}))
	}, [contentMatches, trimmedSearchTerm])

	const contentMatchesByNote = useMemo<ContentMatchGroup[]>(() => {
		if (trimmedSearchTerm.length === 0) {
			return []
		}

		const groups: ContentMatchGroup[] = []
		const byPath = new Map<string, ContentMatchGroup>()

		for (const match of contentMatchesWithSnippet) {
			let group = byPath.get(match.path)
			if (!group) {
				group = { path: match.path, matches: [] }
				byPath.set(match.path, group)
				groups.push(group)
			}

			group.matches.push(match)
		}

		return groups
	}, [contentMatchesWithSnippet, trimmedSearchTerm])

	return {
		trimmedSearchTerm,
		contentMatchesByNote,
	}
}

export type { ContentMatchWithSnippet, ContentMatchGroup }
