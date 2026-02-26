import { MAX_SIBLING_NOTE_NAMES } from "./constants"
import { stripExtension } from "./sanitize"
import type { RenameNoteWithAIDirEntry } from "./types"

function toExcludedFileNameSet(
	excludedFileNames?: string | Iterable<string>,
): Set<string> {
	if (!excludedFileNames) {
		return new Set()
	}

	if (typeof excludedFileNames === "string") {
		return new Set([excludedFileNames])
	}

	return new Set(excludedFileNames)
}

export function collectSiblingNoteNames(
	entries: RenameNoteWithAIDirEntry[],
	excludedFileNames?: string | Iterable<string>,
): string[] {
	const excludedFileNameSet = toExcludedFileNameSet(excludedFileNames)

	return entries
		.filter(
			(entry) =>
				!!entry.name &&
				!excludedFileNameSet.has(entry.name) &&
				!entry.name.startsWith(".") &&
				entry.name.toLowerCase().endsWith(".md"),
		)
		.map((entry) => stripExtension(entry.name as string, ".md").trim())
		.filter((name) => name.length > 0)
		.slice(0, MAX_SIBLING_NOTE_NAMES)
}
