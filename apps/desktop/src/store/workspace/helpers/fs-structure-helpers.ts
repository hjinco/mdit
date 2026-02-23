import { relative, resolve } from "pathe"

const MARKDOWN_EXTENSION_REGEX = /\.md$/i
const ABSOLUTE_PROTOCOL_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

export const normalizeSlashes = (value: string) => value.replace(/\\/g, "/")

export const isMarkdownNotePath = (value: string) =>
	MARKDOWN_EXTENSION_REGEX.test(value)

export const stripMarkdownExtension = (value: string) => {
	if (value.toLowerCase().endsWith(".mdx")) {
		return value.slice(0, -4)
	}
	if (value.toLowerCase().endsWith(".md")) {
		return value.slice(0, -3)
	}
	return value
}

export const normalizeWikiQueryPath = (value: string) => {
	const normalized = normalizeSlashes(value.trim())
		.replace(/^(\.\/)+/, "")
		.replace(/^[/\\]+/, "")
	return stripMarkdownExtension(normalized)
}

export const pathSuffixMatches = (path: string, suffix: string) => {
	if (path === suffix) {
		return true
	}

	if (!path.endsWith(suffix) || path.length <= suffix.length) {
		return false
	}

	return path[path.length - suffix.length - 1] === "/"
}

export const isExternalWikiTarget = (value: string) => {
	const trimmed = value.trim()
	return (
		trimmed.startsWith("#") ||
		trimmed.startsWith("//") ||
		ABSOLUTE_PROTOCOL_REGEX.test(trimmed)
	)
}

export const splitWikiTargetSuffix = (value: string) => {
	const hashIndex = value.indexOf("#")
	if (hashIndex === -1) {
		return { path: value, suffix: "" }
	}

	return {
		path: value.slice(0, hashIndex),
		suffix: value.slice(hashIndex),
	}
}

export const doesWikiTargetReferToRelPath = (
	rawTarget: string,
	relPath: string,
) => {
	const trimmed = rawTarget.trim()
	if (!trimmed || isExternalWikiTarget(trimmed)) {
		return false
	}

	const { path } = splitWikiTargetSuffix(trimmed)
	const normalizedQuery = normalizeWikiQueryPath(path)
	if (!normalizedQuery) {
		return false
	}

	const relNoExt = stripMarkdownExtension(
		normalizeSlashes(relPath),
	).toLowerCase()
	const queryNoExt = normalizedQuery.toLowerCase()
	return pathSuffixMatches(relNoExt, queryNoExt)
}

export const withPreservedSurroundingWhitespace = (
	original: string,
	replacement: string,
) => {
	const leading = original.match(/^\s*/)?.[0] ?? ""
	const trailing = original.match(/\s*$/)?.[0] ?? ""
	return `${leading}${replacement}${trailing}`
}

export const toWikiTargetFromAbsolutePath = (
	workspacePath: string,
	notePath: string,
) => {
	const relPath = normalizeSlashes(relative(workspacePath, notePath))
	return stripMarkdownExtension(relPath)
}

export const resolveSourcePath = (
	workspacePath: string,
	relPath: string,
	oldPath: string,
	newPath: string,
) => {
	const absolutePath = normalizeSlashes(resolve(workspacePath, relPath))
	if (absolutePath === normalizeSlashes(oldPath)) {
		return newPath
	}
	return absolutePath
}
