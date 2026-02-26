import { isMarkdownPath } from "../shared/markdown"
import type { RenameNoteWithAIEntry } from "./types"

export function collectEntriesToProcess(entries: RenameNoteWithAIEntry[]) {
	return Array.from(
		new Map(
			entries
				.filter((entry) => !entry.isDirectory && isMarkdownPath(entry.path))
				.map((entry) => [entry.path, entry]),
		).values(),
	)
}
