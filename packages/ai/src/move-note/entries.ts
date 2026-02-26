import { isMarkdownPath } from "../shared/markdown"
import type { MoveNoteWithAIEntry } from "./types"

export function collectEntriesToProcess(entries: MoveNoteWithAIEntry[]) {
	return Array.from(
		new Map(
			entries
				.filter((entry) => !entry.isDirectory && isMarkdownPath(entry.path))
				.map((entry) => [entry.path, entry]),
		).values(),
	)
}
