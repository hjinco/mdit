import { relative } from "pathe"
import { useStore } from "@/store"
import {
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@/utils/path-utils"
import { hasParentTraversal, isAbsoluteLike } from "./link-utils"

export type ImageLinkData = {
	url: string
	wiki: boolean
	wikiTarget?: string
}

export function buildImageLinkData(path: string): ImageLinkData {
	if (!path) {
		return { url: path, wiki: false }
	}

	const trimmed = path.trim()
	if (!trimmed || trimmed.startsWith("http")) {
		return { url: path, wiki: false }
	}

	const workspacePath = useStore.getState().workspacePath
	if (!workspacePath) {
		return { url: path, wiki: false }
	}

	if (isAbsoluteLike(trimmed)) {
		if (!isPathEqualOrDescendant(trimmed, workspacePath)) {
			return { url: trimmed, wiki: false }
		}

		const relativePath = normalizePathSeparators(
			relative(workspacePath, trimmed),
		)
		return {
			url: relativePath,
			wiki: true,
			wikiTarget: relativePath,
		}
	}

	const normalized = normalizePathSeparators(trimmed)
	if (hasParentTraversal(normalized)) {
		return { url: normalized, wiki: false }
	}
	return {
		url: normalized,
		wiki: true,
		wikiTarget: normalized,
	}
}
