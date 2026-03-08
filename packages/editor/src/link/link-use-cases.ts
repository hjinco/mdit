import { dirname as pathDirname, relative } from "pathe"
import type { LinkServices } from "./link-ports"
import type { LinkMode, WorkspaceFileOption } from "./link-toolbar-utils"
import {
	formatMarkdownPath,
	normalizePathSeparators,
	normalizeWikiTargetForDisplay,
} from "./link-toolbar-utils"

export async function resolvePreferredTarget({
	currentTabPath,
	fallbackTarget,
	preferFallbackWhenUnresolved,
	rawTarget,
	services,
	warnContext,
	workspacePath,
}: {
	currentTabPath: string | null
	fallbackTarget: string
	preferFallbackWhenUnresolved: boolean
	rawTarget: string
	services: Pick<LinkServices, "resolver">
	warnContext: string
	workspacePath: string | null
}): Promise<string> {
	if (!workspacePath || !services.resolver) {
		return fallbackTarget
	}

	try {
		const resolved = await services.resolver.resolveWikiLink({
			workspacePath,
			currentNotePath: currentTabPath,
			rawTarget,
		})
		const canonicalTarget = normalizeWikiTargetForDisplay(
			resolved.canonicalTarget,
		)

		if (preferFallbackWhenUnresolved && resolved.unresolved) {
			return fallbackTarget || canonicalTarget
		}

		return canonicalTarget || fallbackTarget
	} catch (error) {
		console.warn(warnContext, error)
		return fallbackTarget
	}
}

export async function loadLinkSuggestions({
	currentTabPath,
	limit,
	services,
	workspacePath,
}: {
	currentTabPath: string | null
	limit: number
	services: Pick<LinkServices, "suggestions">
	workspacePath: string | null
}): Promise<WorkspaceFileOption[]> {
	if (!workspacePath || !currentTabPath || !services.suggestions) {
		return []
	}

	const config = await services.suggestions.getIndexingConfig(workspacePath)
	const hasEmbeddingConfig = Boolean(
		config?.embeddingProvider && config.embeddingModel,
	)
	if (!hasEmbeddingConfig) {
		return []
	}

	return services.suggestions.getRelatedNotes({
		workspacePath,
		currentTabPath,
		limit,
	})
}

export async function createLinkedNote({
	currentTabPath,
	linkMode,
	services,
	value,
	workspacePath,
}: {
	currentTabPath: string | null
	linkMode: LinkMode
	services: Pick<LinkServices, "noteCreation">
	value: string
	workspacePath: string | null
}): Promise<{
	newFilePath: string
	nextUrl: string
	nextWikiTarget: string | null
} | null> {
	if (!workspacePath || !services.noteCreation) {
		return null
	}

	const targetDirectory = currentTabPath
		? pathDirname(currentTabPath)
		: workspacePath
	const fallbackName = value || "Untitled"
	const newFilePath = await services.noteCreation.createNote(targetDirectory, {
		initialName: fallbackName,
		openPath: false,
	})

	if (!newFilePath) {
		return null
	}

	let nextUrl = fallbackName
	let nextWikiTarget: string | null = fallbackName

	if (linkMode === "markdown") {
		const relativePath = normalizePathSeparators(
			relative(targetDirectory, newFilePath),
		)
		nextUrl = formatMarkdownPath(relativePath)
		nextWikiTarget = null
	} else {
		nextUrl = newFilePath.split("/").pop()?.replace(/\.md$/, "") || fallbackName
		nextWikiTarget = nextUrl
	}

	return { newFilePath, nextUrl, nextWikiTarget }
}
