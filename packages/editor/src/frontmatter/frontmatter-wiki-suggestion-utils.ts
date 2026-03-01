import type { WorkspaceFileOption } from "../link/link-kit-types"
import {
	normalizePathSeparators,
	normalizeWikiTargetForDisplay,
} from "../link/link-toolbar-utils"

export type FrontmatterWikiSuggestionEntry = {
	displayName: string
	relativePath: string
	target: string
}

export function buildFrontmatterWikiSuggestions(
	workspaceFiles: WorkspaceFileOption[],
	query: string,
): FrontmatterWikiSuggestionEntry[] {
	const normalizedQuery = normalizePathSeparators(query).toLowerCase()
	const suggestions = workspaceFiles
		.filter((file) => {
			if (!normalizedQuery) return true
			return (
				file.displayName.toLowerCase().includes(normalizedQuery) ||
				file.relativePathLower.includes(normalizedQuery)
			)
		})
		.slice(0, 12)
		.map((file) => ({
			displayName: file.displayName,
			relativePath: file.relativePath,
			target: normalizeWikiTargetForDisplay(file.relativePath),
		}))

	return suggestions.filter((item) => Boolean(item.target))
}
