import {
	hasParentTraversal,
	isAbsoluteLike,
	normalizePathSeparators,
} from "@mdit/editor/link"
import { isPathEqualOrDescendant } from "@mdit/utils/path-utils"
import { relative } from "pathe"
import { getDesktopRuntime } from "@/state"

export type ImageLinkData = {
	url: string
	embedTarget?: string
}

export function buildImageLinkData(path: string): ImageLinkData {
	if (!path) {
		return { url: path }
	}

	const trimmed = path.trim()
	if (!trimmed || trimmed.startsWith("http")) {
		return { url: path }
	}

	const workspacePath =
		getDesktopRuntime().workspace.getSnapshot().workspacePath
	if (!workspacePath) {
		return { url: path }
	}

	if (isAbsoluteLike(trimmed)) {
		if (!isPathEqualOrDescendant(trimmed, workspacePath)) {
			return { url: "" }
		}

		const relativePath = normalizePathSeparators(
			relative(workspacePath, trimmed),
		)
		return {
			url: relativePath,
			embedTarget: relativePath,
		}
	}

	const normalized = normalizePathSeparators(trimmed)
	if (hasParentTraversal(normalized)) {
		return { url: normalized }
	}
	return {
		url: normalized,
		embedTarget: normalized,
	}
}
