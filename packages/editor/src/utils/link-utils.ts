import { isAbsolute } from "pathe"

const BACKSLASH_REGEX = /\\/g
const MULTIPLE_SLASHES_REGEX = /\/{2,}/g

const normalizePathSeparators = (path: string): string => {
	const withForwardSlashes = path.replace(BACKSLASH_REGEX, "/")
	const collapsed = withForwardSlashes.replace(MULTIPLE_SLASHES_REGEX, "/")
	if (collapsed.length <= 1) {
		return collapsed
	}
	return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed
}

export const WINDOWS_ABSOLUTE_REGEX = /^[A-Za-z]:[\\/]/

export function hasParentTraversal(path: string): boolean {
	const segments = normalizePathSeparators(path).split("/")
	return segments.some((segment) => segment === "..")
}

export function isAbsoluteLike(path: string): boolean {
	return (
		isAbsolute(path) ||
		path.startsWith("/") ||
		WINDOWS_ABSOLUTE_REGEX.test(path)
	)
}

export function startsWithHttpProtocol(value: string): boolean {
	const lower = value.trim().toLowerCase()
	return lower.startsWith("http://") || lower.startsWith("https://")
}
