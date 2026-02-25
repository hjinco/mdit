import { MAX_NOTE_CONTEXT_LENGTH } from "./constants"
import { stripExtension } from "./sanitize"

export function buildRenamePrompt({
	currentName,
	otherNoteNames,
	content,
	dirPath,
}: {
	currentName: string
	otherNoteNames: string[]
	content: string
	dirPath: string
}) {
	const truncatedContent =
		content.length > MAX_NOTE_CONTEXT_LENGTH
			? `${content.slice(0, MAX_NOTE_CONTEXT_LENGTH)}\n…`
			: content

	const others =
		otherNoteNames.length > 0
			? otherNoteNames.map((name) => `- ${name}`).join("\n")
			: "None"

	return `Generate a better file name for a markdown note.
- The note is currently called "${stripExtension(currentName, ".md")}".
- The note resides in the folder: ${dirPath}.
- Other notes in this folder:\n${others}

Note content:
---
${truncatedContent}
---

Respond with a single title (no quotes, no markdown, no extension).`
}
