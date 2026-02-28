import { isAbsolute } from "pathe"

import { normalizePathSeparators } from "./path-utils"

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
