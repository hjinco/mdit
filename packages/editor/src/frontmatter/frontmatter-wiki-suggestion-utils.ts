import type { WorkspaceFileOption } from "../link/link-kit-types"
import {
	normalizePathSeparators,
	normalizeWikiTargetForDisplay,
} from "../link/link-toolbar-utils"
import { parseFrontmatterWikiSegments } from "./frontmatter-wiki-link-utils"

export type FrontmatterWikiSuggestionEntry = {
	displayName: string
	relativePath: string
	target: string
}

type BuildFrontmatterWikiSuggestionsOptions = {
	excludeTargetKeys?: ReadonlySet<string>
}

const MAX_FRONTMATTER_WIKI_SUGGESTIONS = 50

export function getFrontmatterWikiSuggestionTargetKey(
	value: string,
): string | null {
	const trimmed = value.trim()
	if (!trimmed) return null

	const segments = parseFrontmatterWikiSegments(trimmed)
	if (segments.length === 1 && segments[0]?.type === "wikiLink") {
		const normalizedTarget = normalizeWikiTargetForDisplay(segments[0].target)
		return normalizedTarget ? normalizedTarget.toLowerCase() : null
	}

	if (segments.some((segment) => segment.type === "wikiLink")) {
		return null
	}

	const normalizedTarget = normalizeWikiTargetForDisplay(trimmed)
	return normalizedTarget ? normalizedTarget.toLowerCase() : null
}

export function buildFrontmatterWikiSuggestions(
	workspaceFiles: WorkspaceFileOption[],
	query: string,
	options?: BuildFrontmatterWikiSuggestionsOptions,
): FrontmatterWikiSuggestionEntry[] {
	const normalizedQuery = normalizePathSeparators(query).toLowerCase()
	const excludeTargetKeys = options?.excludeTargetKeys
	const suggestions: FrontmatterWikiSuggestionEntry[] = []

	for (const file of workspaceFiles) {
		if (
			normalizedQuery &&
			!file.displayName.toLowerCase().includes(normalizedQuery) &&
			!file.relativePathLower.includes(normalizedQuery)
		) {
			continue
		}

		const target = normalizeWikiTargetForDisplay(file.relativePath)
		if (!target) continue

		if (excludeTargetKeys?.has(target.toLowerCase())) {
			continue
		}

		suggestions.push({
			displayName: file.displayName,
			relativePath: file.relativePath,
			target,
		})

		if (suggestions.length >= MAX_FRONTMATTER_WIKI_SUGGESTIONS) {
			break
		}
	}

	return suggestions
}
