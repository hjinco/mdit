import { dirname, relative } from "pathe"
import { MAX_MOVE_NOTE_CONTEXT_LENGTH } from "./constants"
import type { MoveNoteWithAIEntry } from "./types"

const ROOT_LABEL = "."

function formatDirectoryPath(workspacePath: string, directoryPath: string) {
	if (directoryPath === workspacePath) {
		return ROOT_LABEL
	}

	const relativePath = relative(workspacePath, directoryPath)
	return relativePath.length > 0 ? relativePath : ROOT_LABEL
}

export function buildMovePrompt(params: {
	workspacePath: string
	entries: MoveNoteWithAIEntry[]
	candidateDirectories: string[]
}) {
	const candidates = params.candidateDirectories
		.map(
			(directoryPath, index) =>
				`${index + 1}. ${formatDirectoryPath(params.workspacePath, directoryPath)}`,
		)
		.join("\n")

	const targets = params.entries
		.map((entry, index) => {
			const currentDirectoryPath = dirname(entry.path)
			return `${index + 1}. ${entry.path} (current folder: ${formatDirectoryPath(
				params.workspacePath,
				currentDirectoryPath,
			)})`
		})
		.join("\n")

	return `Organize the target markdown notes by calling tools.
Workspace root: ${params.workspacePath}

Targets:
${targets}

Available existing folders:
${candidates}

Rules:
- Use list_targets and list_directories first.
- Use read_note before deciding where to move a note.
- Use move_note once per target note.
- Existing folders only. Do not create folders.
- Call finish_organization only after all targets are handled.
- Keep note-content context usage concise (each read_note result may be truncated to ${MAX_MOVE_NOTE_CONTEXT_LENGTH} chars).`
}
