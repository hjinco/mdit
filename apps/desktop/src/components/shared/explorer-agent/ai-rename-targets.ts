import { isMarkdownPath } from "@mdit/ai"
import { dirname } from "pathe"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"

export function collectAIRenameTargets(
	targetPaths: string[],
	resolveEntryByPath: (path: string) => WorkspaceEntry | undefined,
): WorkspaceEntry[] {
	if (targetPaths.length === 0) {
		return []
	}

	const uniquePaths = Array.from(new Set(targetPaths))
	const targets = uniquePaths
		.map((path) => resolveEntryByPath(path))
		.filter((entry): entry is WorkspaceEntry => Boolean(entry))

	if (targets.length !== uniquePaths.length) {
		return []
	}

	const areAllMarkdownNotes = targets.every(
		(entry) => !entry.isDirectory && isMarkdownPath(entry.path),
	)
	if (!areAllMarkdownNotes) {
		return []
	}

	const directoryPath = dirname(targets[0].path)
	const areInSameDirectory = targets.every(
		(entry) => dirname(entry.path) === directoryPath,
	)

	return areInSameDirectory ? targets : []
}
