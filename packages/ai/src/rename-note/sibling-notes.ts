import { stripExtension } from "./sanitize"
import type { RenameNoteWithAIDirEntry } from "./types"

export function collectSiblingNoteNames(
	entries: RenameNoteWithAIDirEntry[],
	currentFileName: string,
): string[] {
	return entries
		.filter(
			(entry) =>
				!!entry.name &&
				entry.name !== currentFileName &&
				!entry.name.startsWith(".") &&
				entry.name.toLowerCase().endsWith(".md"),
		)
		.map((entry) => stripExtension(entry.name as string, ".md").trim())
		.filter((name) => name.length > 0)
		.slice(0, 10)
}
