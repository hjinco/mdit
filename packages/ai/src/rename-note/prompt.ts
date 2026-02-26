import { MAX_NOTE_CONTEXT_LENGTH } from "./constants"
import { stripExtension } from "./sanitize"
import type { RenameNoteWithAIEntry } from "./types"

export function buildRenamePrompt({
	dirPath,
	entries,
}: {
	dirPath: string
	entries: RenameNoteWithAIEntry[]
}) {
	const targetList = entries
		.map((target, index) => {
			return `${index + 1}. path: ${target.path} (current title: ${stripExtension(
				target.name,
				".md",
			)})`
		})
		.join("\n\n")

	return `Rename the target markdown notes by calling tools.
Folder path: ${dirPath}

Targets:
${targetList}

Rules:
- Call list_targets and list_sibling_notes first.
- Call read_note before set_title for each target.
- Call set_title for every target path.
- Suggest concise titles (<= 60 chars), no extension, and avoid / \\ : * ? " < > |.
- Do not create or rename files directly.
- Call finish_rename only after all targets are handled.
- Keep note-content context usage concise (each read_note result may be truncated to ${MAX_NOTE_CONTEXT_LENGTH} chars).`
}
