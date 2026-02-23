import type { WorkspaceEntry } from "../workspace-state"
import { findEntryByPath } from "./entry-helpers"
import { isMarkdownNotePath, normalizeSlashes } from "./fs-structure-helpers"

const collectMarkdownDescendants = (
	entry: WorkspaceEntry,
	accumulator: Set<string>,
) => {
	if (!entry.isDirectory) {
		const normalizedPath = normalizeSlashes(entry.path)
		if (isMarkdownNotePath(normalizedPath)) {
			accumulator.add(normalizedPath)
		}
		return
	}

	for (const child of entry.children ?? []) {
		collectMarkdownDescendants(child, accumulator)
	}
}

export const resolveDeletedMarkdownPaths = (
	paths: string[],
	entries: WorkspaceEntry[],
) => {
	const markdownPaths = new Set<string>()

	for (const path of paths) {
		const normalizedPath = normalizeSlashes(path)
		if (isMarkdownNotePath(normalizedPath)) {
			markdownPaths.add(normalizedPath)
		}

		const entry =
			findEntryByPath(entries, path) ?? findEntryByPath(entries, normalizedPath)
		if (entry?.isDirectory) {
			collectMarkdownDescendants(entry, markdownPaths)
		}
	}

	return [...markdownPaths]
}

export const isPathDeletedByTargets = (
	normalizedPath: string,
	deletedPathSet: Set<string>,
) => {
	for (const deletedPath of deletedPathSet) {
		if (
			normalizedPath === deletedPath ||
			normalizedPath.startsWith(`${deletedPath}/`)
		) {
			return true
		}
	}
	return false
}
