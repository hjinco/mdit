import { useMemo } from "react"
import { stripMarkdownExtension } from "./path-utils"
import type { CommandMenuEntry } from "./types"

export type NoteResult = {
	path: string
	label: string
	normalizedLabel: string
	relativePath: string
	keywords: string[]
	modifiedAt?: Date
}

const MARKDOWN_EXTENSION_REGEX = /\.md$/i
const RECENT_NOTES_LIMIT = 5

const isMarkdownFile = (entry: CommandMenuEntry) =>
	!entry.isDirectory && MARKDOWN_EXTENSION_REGEX.test(entry.name)

export const toRelativePath = (
	fullPath: string,
	workspacePath: string | null,
) => {
	if (!workspacePath) {
		return fullPath
	}

	if (fullPath === workspacePath) {
		return fullPath
	}

	if (fullPath.startsWith(workspacePath)) {
		const separator = fullPath.charAt(workspacePath.length)
		if (separator === "/" || separator === "\\") {
			return fullPath.slice(workspacePath.length + 1)
		}

		return fullPath.slice(workspacePath.length)
	}

	return fullPath
}

const createNoteResult = (
	entry: CommandMenuEntry,
	workspacePath: string | null,
): NoteResult => {
	const label = stripMarkdownExtension(entry.name).trim() || entry.name
	const relativePath = toRelativePath(entry.path, workspacePath)

	return {
		path: entry.path,
		label,
		normalizedLabel: label.toLowerCase(),
		relativePath,
		keywords: [label],
		modifiedAt: entry.modifiedAt,
	}
}

export const collectMarkdownNotes = (
	entries: CommandMenuEntry[],
	workspacePath: string | null,
) => {
	const results: NoteResult[] = []
	const stack = [...entries]

	while (stack.length > 0) {
		const node = stack.pop()
		if (!node) {
			continue
		}

		if (isMarkdownFile(node)) {
			results.push(createNoteResult(node, workspacePath))
		}

		if (node.children?.length) {
			stack.push(...node.children)
		}
	}

	return results
}

const takeRecentNotes = (noteResults: NoteResult[]) => {
	return [...noteResults]
		.sort(
			(a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0),
		)
		.slice(0, RECENT_NOTES_LIMIT)
}

export const filterNoteResults = (noteResults: NoteResult[], query: string) => {
	const normalizedQuery = query.trim().toLowerCase()

	if (!normalizedQuery) {
		return takeRecentNotes(noteResults)
	}

	return noteResults.filter((note) =>
		note.normalizedLabel.includes(normalizedQuery),
	)
}

export const useNoteNameSearch = (
	entries: CommandMenuEntry[],
	workspacePath: string | null,
	query: string,
) => {
	const noteResults = useMemo(
		() => collectMarkdownNotes(entries, workspacePath),
		[entries, workspacePath],
	)

	const noteResultsByPath = useMemo(() => {
		const map = new Map<string, NoteResult>()
		for (const note of noteResults) {
			map.set(note.path, note)
		}
		return map
	}, [noteResults])

	const filteredNoteResults = useMemo(
		() => filterNoteResults(noteResults, query),
		[noteResults, query],
	)

	return {
		noteResults,
		filteredNoteResults,
		noteResultsByPath,
	}
}
