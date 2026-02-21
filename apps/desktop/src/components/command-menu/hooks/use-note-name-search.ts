import { useMemo } from "react"

import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"

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
const isMarkdownFile = (entry: WorkspaceEntry) =>
	!entry.isDirectory && MARKDOWN_EXTENSION_REGEX.test(entry.name)

export const stripMarkdownExtension = (name: string) =>
	name.replace(MARKDOWN_EXTENSION_REGEX, "")

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

// Shape a workspace entry into the structure the command palette expects.
const createNoteResult = (
	entry: WorkspaceEntry,
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

const collectNotes = (
	entries: WorkspaceEntry[],
	workspacePath: string | null,
) => {
	const results: NoteResult[] = []
	const stack: WorkspaceEntry[] = [...entries]

	while (stack.length > 0) {
		const node = stack.pop()!

		if (isMarkdownFile(node)) {
			results.push(createNoteResult(node, workspacePath))
		}

		if (node.children?.length) {
			stack.push(...node.children)
		}
	}

	return results
}

export const useNoteNameSearch = (
	entries: WorkspaceEntry[],
	workspacePath: string | null,
	query: string,
) => {
	// Build a stable, sorted note index any time the workspace tree changes.
	const noteResults = useMemo(
		() => collectNotes(entries, workspacePath),
		[entries, workspacePath],
	)

	const noteResultsByPath = useMemo(() => {
		const map = new Map<string, NoteResult>()
		for (const note of noteResults) {
			map.set(note.path, note)
		}
		return map
	}, [noteResults])

	// Trim/normalize the incoming search so substring comparisons are simple.
	const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query])

	const filteredNoteResults = useMemo(() => {
		if (!normalizedQuery) {
			// When query is empty, keep only the top N most recently modified notes.
			const recentNotes: NoteResult[] = []
			for (const note of noteResults) {
				const noteTime = note.modifiedAt?.getTime() ?? 0
				let insertAt = recentNotes.length

				for (let index = 0; index < recentNotes.length; index += 1) {
					const existingTime = recentNotes[index].modifiedAt?.getTime() ?? 0
					if (noteTime > existingTime) {
						insertAt = index
						break
					}
				}

				recentNotes.splice(insertAt, 0, note)

				if (recentNotes.length > RECENT_NOTES_LIMIT) {
					recentNotes.pop()
				}
			}

			return recentNotes
		}

		return noteResults.filter((note) => {
			return note.normalizedLabel.includes(normalizedQuery)
		})
	}, [noteResults, normalizedQuery])

	return {
		noteResults,
		filteredNoteResults,
		noteResultsByPath,
		normalizedQuery,
	}
}
