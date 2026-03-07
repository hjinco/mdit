import { dirname, isAbsolute, join, relative } from "pathe"
import type { TImageElement } from "platejs"
import {
	formatMarkdownPath,
	isPathInsideWorkspaceRoot,
	normalizePathSeparators,
	safelyDecodeUrl,
	startsWithHttpProtocol,
	stripLeadingSlashes,
	toWorkspaceRelativeWikiTarget,
} from "../link"

export type ImageLinkMode = "embed" | "markdown"

export type ImageElementWithEmbed = TImageElement & {
	embedTarget?: string
	height?: number
}

type WorkspaceState = {
	tabPath: string | null
	workspacePath: string | null
}

function normalizeMarkdownImageUrl(
	input: string,
	workspaceState: WorkspaceState,
): string {
	const decoded = safelyDecodeUrl(input.trim())
	if (!decoded) {
		return ""
	}

	if (startsWithHttpProtocol(decoded) || decoded.startsWith("#")) {
		return decoded
	}

	const [pathPart, hashPart] = decoded.split("#", 2)
	let normalizedPath = normalizePathSeparators(pathPart)
	const { tabPath, workspacePath } = workspaceState

	if (!normalizedPath) {
		return hashPart ? `#${hashPart}` : ""
	}

	if (workspacePath) {
		const hasRootPrefix = normalizedPath.startsWith("/")
		const isAbsolutePath = isAbsolute(normalizedPath)

		if (hasRootPrefix || isAbsolutePath) {
			const absolutePath = hasRootPrefix
				? join(workspacePath, stripLeadingSlashes(normalizedPath))
				: normalizedPath

			if (isPathInsideWorkspaceRoot(absolutePath, workspacePath)) {
				normalizedPath = normalizePathSeparators(
					relative(tabPath ? dirname(tabPath) : workspacePath, absolutePath),
				)
			}
		}
	}

	if (
		!startsWithHttpProtocol(normalizedPath) &&
		!isAbsolute(normalizedPath) &&
		!normalizedPath.startsWith(".") &&
		!normalizedPath.startsWith("/")
	) {
		normalizedPath = formatMarkdownPath(normalizedPath)
	}

	return hashPart ? `${normalizedPath}#${hashPart}` : normalizedPath
}

function convertEmbedTargetToMarkdownUrl(
	input: string,
	workspaceState: WorkspaceState,
): string {
	const decoded = safelyDecodeUrl(input.trim())
	if (!decoded) {
		return ""
	}

	if (startsWithHttpProtocol(decoded)) {
		return decoded
	}

	const [pathPart, hashPart] = decoded.split("#", 2)
	let normalizedPath = normalizePathSeparators(pathPart)

	if (!normalizedPath) {
		return hashPart ? `#${hashPart}` : ""
	}

	if (workspaceState.workspacePath && workspaceState.tabPath) {
		const absolutePath = join(
			workspaceState.workspacePath,
			stripLeadingSlashes(normalizedPath),
		)
		normalizedPath = normalizePathSeparators(
			relative(dirname(workspaceState.tabPath), absolutePath),
		)
	}

	if (
		!startsWithHttpProtocol(normalizedPath) &&
		!isAbsolute(normalizedPath) &&
		!normalizedPath.startsWith(".") &&
		!normalizedPath.startsWith("/")
	) {
		normalizedPath = formatMarkdownPath(normalizedPath)
	}

	return hashPart ? `${normalizedPath}#${hashPart}` : normalizedPath
}

export function isImageModeToggleDisabled(
	element: Pick<ImageElementWithEmbed, "embedTarget" | "url">,
): boolean {
	const rawValue = element.embedTarget || element.url || ""
	return startsWithHttpProtocol(rawValue)
}

export function buildImageModeUpdate(options: {
	element: Pick<ImageElementWithEmbed, "embedTarget" | "url">
	mode: ImageLinkMode
	workspaceState: WorkspaceState
}): {
	url: string
	embedTarget?: string
} | null {
	const { element, mode, workspaceState } = options
	const currentValue = (element.embedTarget || element.url || "").trim()

	if (!currentValue) {
		return null
	}

	if (mode === "embed") {
		if (startsWithHttpProtocol(currentValue)) {
			return null
		}

		const embedTarget =
			element.embedTarget ||
			toWorkspaceRelativeWikiTarget({
				input: currentValue,
				workspacePath: workspaceState.workspacePath,
				currentTabPath: workspaceState.tabPath,
			})

		if (!embedTarget) {
			return null
		}

		return {
			url: embedTarget,
			embedTarget,
		}
	}

	return {
		url: element.embedTarget
			? convertEmbedTargetToMarkdownUrl(element.embedTarget, workspaceState)
			: normalizeMarkdownImageUrl(currentValue, workspaceState),
	}
}
