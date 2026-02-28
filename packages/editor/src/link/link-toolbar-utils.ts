import {
	basename,
	isAbsolute,
	join,
	dirname as pathDirname,
	resolve,
} from "pathe"
import type {
	LinkWorkspaceEntry,
	WorkspaceFileOption,
} from "../link/link-kit-types"

export type {
	LinkWorkspaceEntry,
	WorkspaceFileOption,
} from "../link/link-kit-types"

export type LinkMode = "wiki" | "markdown"

const backslashRegex = /\\/g
const multipleSlashesRegex = /\/{2,}/g
const trailingSlashesRegex = /\/+$/

// Recursively traverse workspace file tree and collect all .md files for autocomplete
// Returns flattened list with relative paths for suggestion matching
export function flattenWorkspaceFiles(
	entries: LinkWorkspaceEntry[],
	workspacePath: string | null,
): WorkspaceFileOption[] {
	if (!workspacePath) {
		return []
	}

	const normalizedRoot = normalizeWorkspaceRoot(workspacePath)
	const files: WorkspaceFileOption[] = []

	const visit = (nodes: LinkWorkspaceEntry[]) => {
		for (const node of nodes) {
			if (node.isDirectory) {
				if (node.children) {
					visit(node.children)
				}
				continue
			}

			// Only include .md files for linking
			if (!node.name.toLowerCase().endsWith(".md")) {
				continue
			}

			const normalizedAbsolute = normalizePathSeparators(node.path)
			let relativePath = ""

			// Calculate path relative to workspace root by stripping the root prefix
			if (normalizedAbsolute.startsWith(`${normalizedRoot}/`)) {
				relativePath = normalizedAbsolute.slice(normalizedRoot.length + 1)
			} else if (normalizedAbsolute.startsWith(normalizedRoot)) {
				relativePath = normalizedAbsolute.slice(normalizedRoot.length)
			}

			relativePath = stripLeadingSlashes(relativePath)
			if (!relativePath) {
				relativePath = node.name
			}

			const normalizedRelative = normalizePathSeparators(relativePath)

			files.push({
				absolutePath: node.path,
				displayName: stripFileExtensionForDisplay(node.name),
				relativePath: normalizedRelative,
				relativePathLower: normalizedRelative.toLowerCase(),
			})
		}
	}

	visit(entries)

	files.sort((a, b) => a.relativePathLower.localeCompare(b.relativePathLower))

	return files
}

export function stripFileExtensionForDisplay(value: string): string {
	const lastDotIndex = value.lastIndexOf(".")
	if (lastDotIndex <= 0) {
		return value
	}

	return value.slice(0, lastDotIndex)
}

// Convert all path separators to forward slashes and remove duplicates/trailing slashes
// Ensures consistent path format across different operating systems
export function createPathQueryCandidates(
	normalizedLowerQuery: string,
): string[] {
	if (!normalizedLowerQuery) {
		return []
	}

	const candidates = new Set<string>([normalizedLowerQuery])

	const withoutCurrentDir = stripCurrentDirectoryPrefix(normalizedLowerQuery)
	candidates.add(withoutCurrentDir)

	const withoutLeadingSlashes = stripLeadingSlashes(normalizedLowerQuery)
	candidates.add(withoutLeadingSlashes)

	const withoutBoth = stripCurrentDirectoryPrefix(withoutLeadingSlashes)
	candidates.add(withoutBoth)

	return Array.from(candidates).filter(Boolean)
}

export function stripCurrentDirectoryPrefix(value: string): string {
	let result = value
	while (result.startsWith("./")) {
		result = result.slice(2)
	}
	return result
}

export function normalizePathSeparators(path: string): string {
	const withForwardSlashes = path.replace(backslashRegex, "/")
	const collapsed = withForwardSlashes.replace(multipleSlashesRegex, "/")
	if (collapsed.length <= 1) {
		return collapsed
	}
	return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed
}

/** Prefixes relative markdown path with ./ when it doesn't start with . or / */
export function formatMarkdownPath(relativePath: string): string {
	return relativePath &&
		!relativePath.startsWith(".") &&
		!relativePath.startsWith("/")
		? `./${relativePath}`
		: relativePath
}

export function normalizeWikiTargetForDisplay(value: string): string {
	const decoded = safelyDecodeUrl(value.trim())
	if (!decoded) {
		return ""
	}

	const [pathPart, hashPart] = decoded.split("#", 2)
	let normalized = normalizePathSeparators(pathPart)
	normalized = stripCurrentDirectoryPrefix(normalized)
	normalized = stripLeadingSlashes(normalized)

	if (normalized.endsWith(".mdx")) {
		normalized = normalized.slice(0, -4)
	} else if (normalized.endsWith(".md")) {
		normalized = normalized.slice(0, -3)
	}

	return hashPart ? `${normalized}#${hashPart}` : normalized
}

export function normalizeMarkdownPathForDisplay(value: string): string {
	const decoded = safelyDecodeUrl(value.trim())
	if (!decoded) {
		return ""
	}

	const [pathPart, hashPart] = decoded.split("#", 2)
	const normalized = normalizePathSeparators(pathPart)
	return hashPart ? `${normalized}#${hashPart}` : normalized
}

export function getLinkedNoteDisplayName(options: {
	mode: LinkMode
	nextUrl: string
	wikiTarget?: string | null
	isWebLink: boolean
}): string | null {
	const { mode, nextUrl, wikiTarget, isWebLink } = options

	if (isWebLink) {
		return null
	}

	const rawValue = mode === "wiki" ? (wikiTarget ?? nextUrl) : nextUrl
	const decoded = safelyDecodeUrl(rawValue.trim())
	if (!decoded) {
		return null
	}

	const [pathPart] = decoded.split("#", 2)
	if (!pathPart) {
		return null
	}

	let normalizedPath = normalizePathSeparators(pathPart)
	normalizedPath = stripCurrentDirectoryPrefix(normalizedPath)
	normalizedPath = stripLeadingSlashes(normalizedPath)
	normalizedPath = stripMarkdownExtension(normalizedPath)

	if (!normalizedPath) {
		return null
	}

	const displayName = basename(normalizedPath).trim()
	return displayName || null
}

export function toWorkspaceRelativeWikiTarget(options: {
	input: string
	workspacePath: string | null
	currentTabPath: string | null
}): string {
	const { input, workspacePath, currentTabPath } = options
	const decoded = safelyDecodeUrl(input.trim())
	if (!decoded) {
		return ""
	}

	const [pathPart, hashPart] = decoded.split("#", 2)
	let normalizedPath = normalizePathSeparators(pathPart)

	if (!normalizedPath) {
		return hashPart ? `#${hashPart}` : ""
	}

	const hasRootPrefix = normalizedPath.startsWith("/")
	const hasRelativePrefix =
		normalizedPath.startsWith("./") || normalizedPath.startsWith("../")
	const isAbsPath = isAbsolute(normalizedPath)

	if (workspacePath && (hasRootPrefix || hasRelativePrefix || isAbsPath)) {
		const normalizedRoot = normalizeWorkspaceRoot(workspacePath)
		let absolutePath: string | null = null

		if (hasRootPrefix) {
			absolutePath = join(normalizedRoot, stripLeadingSlashes(normalizedPath))
		} else if (isAbsPath) {
			absolutePath = normalizedPath
		} else if (currentTabPath) {
			absolutePath = resolve(pathDirname(currentTabPath), normalizedPath)
		}

		if (absolutePath) {
			const normalizedAbsolute = normalizePathSeparators(absolutePath)
			if (normalizedAbsolute === normalizedRoot) {
				normalizedPath = ""
			} else if (normalizedAbsolute.startsWith(`${normalizedRoot}/`)) {
				normalizedPath = normalizedAbsolute.slice(normalizedRoot.length + 1)
			}
		}
	}

	normalizedPath = stripCurrentDirectoryPrefix(
		stripLeadingSlashes(normalizedPath),
	)
	normalizedPath = stripMarkdownExtension(normalizedPath)

	return hashPart ? `${normalizedPath}#${hashPart}` : normalizedPath
}

function stripMarkdownExtension(value: string): string {
	const lower = value.toLowerCase()
	if (lower.endsWith(".mdx")) {
		return value.slice(0, -4)
	}
	if (lower.endsWith(".md")) {
		return value.slice(0, -3)
	}
	return value
}

export function parseInternalLinkTarget(value: string): {
	rawPath: string
	target: string
	hash?: string
} {
	const decoded = safelyDecodeUrl(value.trim())
	const [pathPart, hashPart] = decoded.split("#", 2)
	let rawPath = normalizePathSeparators(pathPart)
	rawPath = stripCurrentDirectoryPrefix(rawPath)
	rawPath = stripLeadingSlashes(rawPath)

	return {
		rawPath,
		target: stripMarkdownExtension(rawPath),
		hash: hashPart,
	}
}

function pickPreferredFile(
	matches: WorkspaceFileOption[],
	normalizedCurrentDir: string | null,
): WorkspaceFileOption | null {
	if (!matches.length) {
		return null
	}

	if (!normalizedCurrentDir) {
		return matches[0]
	}

	const preferred = matches.find((file) => {
		const fileDir = normalizePathSeparators(pathDirname(file.absolutePath))
		return fileDir === normalizedCurrentDir
	})

	return preferred ?? matches[0]
}

export function resolveInternalLinkPath(options: {
	rawPath: string
	target: string
	workspaceFiles: WorkspaceFileOption[]
	workspacePath: string | null
	currentTabPath: string | null
}): string | null {
	const { rawPath, target, workspaceFiles, workspacePath, currentTabPath } =
		options

	if (!workspacePath || workspaceFiles.length === 0) {
		return null
	}

	const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspacePath)
	if (!normalizedWorkspaceRoot) {
		return null
	}

	const normalizedCurrentDir = currentTabPath
		? normalizePathSeparators(pathDirname(currentTabPath))
		: null

	const normalizedAbsoluteMap = new Map<string, string>()
	for (const file of workspaceFiles) {
		normalizedAbsoluteMap.set(
			normalizePathSeparators(file.absolutePath),
			file.absolutePath,
		)
	}

	const segments = new Set<string>()
	if (rawPath) {
		segments.add(rawPath)
	}
	if (target) {
		segments.add(`${target}.md`)
		segments.add(`${target}.mdx`)
	}

	const candidates: string[] = []
	const addCandidate = (base: string | null, segment: string) => {
		if (!base || !segment) {
			return
		}
		candidates.push(normalizePathSeparators(join(base, segment)))
	}

	for (const segment of segments) {
		addCandidate(normalizedCurrentDir, segment)
		addCandidate(normalizedWorkspaceRoot, segment)
	}

	for (const candidate of candidates) {
		const matched = normalizedAbsoluteMap.get(candidate)
		if (matched) {
			return matched
		}
	}

	const targetLower = target.toLowerCase()
	if (targetLower) {
		const relativeMatches = workspaceFiles.filter(
			(file) =>
				stripMarkdownExtension(file.relativePath).toLowerCase() === targetLower,
		)
		const relativeMatch = pickPreferredFile(
			relativeMatches,
			normalizedCurrentDir,
		)
		if (relativeMatch) {
			return relativeMatch.absolutePath
		}
	}

	const hasSeparator = target.includes("/") || target.includes("\\")
	if (!hasSeparator && targetLower) {
		const nameMatches = workspaceFiles.filter(
			(file) =>
				stripMarkdownExtension(file.displayName).toLowerCase() === targetLower,
		)
		const nameMatch = pickPreferredFile(nameMatches, normalizedCurrentDir)
		if (nameMatch) {
			return nameMatch.absolutePath
		}
	}

	return null
}

export function normalizeWorkspaceRoot(workspacePath: string): string {
	if (!workspacePath) {
		return ""
	}
	const normalized = normalizePathSeparators(workspacePath)
	return normalized.replace(trailingSlashesRegex, "")
}

export function isPathInsideWorkspaceRoot(
	absolutePath: string,
	workspacePath: string,
): boolean {
	const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspacePath)
	if (!normalizedWorkspaceRoot) {
		return false
	}

	const normalizedAbsolute = normalizePathSeparators(resolve(absolutePath))
	return (
		normalizedAbsolute === normalizedWorkspaceRoot ||
		normalizedAbsolute.startsWith(`${normalizedWorkspaceRoot}/`)
	)
}

export function stripLeadingSlashes(value: string): string {
	let index = 0
	while (
		index < value.length &&
		(value[index] === "/" || value[index] === "\\")
	) {
		index += 1
	}
	return value.slice(index)
}

// Store URLs percent-encoded so markdown serialization keeps spaces & Unicode stable
// while avoiding double-encoding if segments are already escaped.
export function ensureUriEncoding(url: string): string {
	try {
		const isEncoded = url !== decodeURIComponent(url)
		return isEncoded ? url : encodeURI(url)
	} catch (error) {
		if (error instanceof URIError) {
			return url
		}
		throw error
	}
}

export function safelyDecodeUrl(url: string): string {
	try {
		return decodeURI(url)
	} catch (error) {
		if (error instanceof URIError) {
			return url
		}
		throw error
	}
}

export function isJavaScriptUrl(url: string): boolean {
	const decoded = safelyDecodeUrl(url)
	const normalized = decoded.trim().toLowerCase()
	return normalized.startsWith("javascript:")
}
