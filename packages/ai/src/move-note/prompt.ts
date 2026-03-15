import { dirname } from "pathe"
import { MAX_MOVE_NOTE_CONTEXT_LENGTH } from "./constants"
import {
	collectMoveDirectoryCatalogEntries,
	formatMoveDirectoryPath,
} from "./directories"
import type { MoveNoteWithAIEntry } from "./types"

export function formatMoveFolderCatalog(params: {
	workspacePath: string
	candidateDirectories: string[]
}) {
	return collectMoveDirectoryCatalogEntries(params)
		.map((entry, index) => `${index + 1}. ${entry.displayPath}`)
		.join("\n")
}

export function buildMovePrompt(params: {
	workspacePath: string
	entries: MoveNoteWithAIEntry[]
	candidateDirectories: string[]
}) {
	const targets = params.entries
		.map((entry, index) => {
			const currentDirectoryPath = dirname(entry.path)
			return `${index + 1}. ${entry.path} (current folder: ${formatMoveDirectoryPath(
				params.workspacePath,
				currentDirectoryPath,
			)})`
		})
		.join("\n")

	const folderCatalog = formatMoveFolderCatalog({
		workspacePath: params.workspacePath,
		candidateDirectories: params.candidateDirectories,
	})

	return `Organize the target markdown notes by calling tools.
Workspace root: ${params.workspacePath}

Targets:
${targets}

Folder catalog:
${folderCatalog}

Rules:
- Use list_targets first.
- Use read_note before deciding where to move a note.
- Use the initial folder catalog to choose destinations.
- Call list_directories only if you need to re-check the available folders.
- Keep note-content context usage concise (each read_note result may be truncated to ${MAX_MOVE_NOTE_CONTEXT_LENGTH} chars).`
}
