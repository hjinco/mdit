const BACKSLASH_REGEX = /\\/g
const MULTIPLE_SLASHES_REGEX = /\/{2,}/g

export const normalizePathSeparators = (path: string): string => {
	const withForwardSlashes = path.replace(BACKSLASH_REGEX, "/")
	const collapsed = withForwardSlashes.replace(MULTIPLE_SLASHES_REGEX, "/")
	if (collapsed.length <= 1) {
		return collapsed
	}
	return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed
}
