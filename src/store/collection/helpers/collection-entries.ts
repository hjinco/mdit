import { findEntryByPath } from "../../workspace/utils/entry-utils"
import type { WorkspaceEntry } from "../../workspace/workspace-slice"

/**
 * Computes collection entries (markdown files) for a given collection path.
 *
 * @param currentCollectionPath - The path of the collection folder, or null
 * @param entries - The workspace entries tree
 * @returns Array of markdown file entries in the collection folder
 */
export function computeCollectionEntries(
	currentCollectionPath: string | null,
	entries: WorkspaceEntry[],
): WorkspaceEntry[] {
	if (!currentCollectionPath) {
		return []
	}

	const folderEntry = findEntryByPath(entries, currentCollectionPath)

	if (!folderEntry || !folderEntry.isDirectory || !folderEntry.children) {
		return []
	}

	// Return only markdown files (exclude folders and non-md files)
	return folderEntry.children.filter(
		(entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith(".md"),
	)
}
