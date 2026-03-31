import { normalizePathSeparators } from "@mdit/utils/path-utils"
import { normalizePinnedDirectoriesList } from "../domain/pinned-directories-helpers"

export function removePinsForPaths(
	pinnedDirectories: string[],
	removedPaths: string[],
): string[] {
	if (removedPaths.length === 0) return pinnedDirectories

	return normalizePinnedDirectoriesList(
		pinnedDirectories.filter((path) => {
			const normalizedPath = normalizePathSeparators(path)
			return !removedPaths.some((removedPath) => {
				const normalizedRemovedPath = normalizePathSeparators(removedPath)
				return (
					normalizedPath === normalizedRemovedPath ||
					normalizedPath.startsWith(`${normalizedRemovedPath}/`)
				)
			})
		}),
	)
}

export function renamePinnedDirectories(
	pinnedDirectories: string[],
	oldPath: string,
	newPath: string,
): string[] {
	const normalizedOldPath = normalizePathSeparators(oldPath)
	const normalizedNewPath = normalizePathSeparators(newPath)

	if (normalizedOldPath === normalizedNewPath) return pinnedDirectories

	const updated = pinnedDirectories.map((path) => {
		const normalizedPath = normalizePathSeparators(path)

		if (normalizedPath === normalizedOldPath) {
			return normalizedNewPath
		}

		if (normalizedPath.startsWith(`${normalizedOldPath}/`)) {
			const suffix = normalizedPath.slice(normalizedOldPath.length)
			return `${normalizedNewPath}${suffix}`
		}

		return path
	})

	return normalizePinnedDirectoriesList(updated)
}
