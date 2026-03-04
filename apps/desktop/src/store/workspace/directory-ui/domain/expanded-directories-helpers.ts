import type { WorkspaceEntry } from "../../workspace-state"

export function collectDirectoryPaths(
	entries: WorkspaceEntry[],
	accumulator: Set<string>,
) {
	for (const entry of entries) {
		if (!entry.isDirectory) continue
		accumulator.add(entry.path)
		if (entry.children) {
			collectDirectoryPaths(entry.children, accumulator)
		}
	}
}

// Drops expanded-directory flags that no longer exist in the refreshed tree.
export function syncExpandedDirectoriesWithEntries(
	expanded: string[],
	entries: WorkspaceEntry[],
): string[] {
	const validDirectories = new Set<string>()
	collectDirectoryPaths(entries, validDirectories)

	const expandedSet = new Set(expanded)
	const normalized: string[] = []

	for (const path of expandedSet) {
		if (validDirectories.has(path)) {
			normalized.push(path)
		}
	}

	return normalized
}
