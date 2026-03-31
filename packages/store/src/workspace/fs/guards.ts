import {
	hasPathConflictWithLockedPaths,
	isPathEqualOrDescendant,
} from "@mdit/utils/path-utils"

export const resolveLockPathsForSource = (
	lockedPaths: Set<string>,
	sourcePath: string,
	allowLockedSourcePath?: boolean,
): Set<string> => {
	if (!allowLockedSourcePath) {
		return lockedPaths
	}

	return new Set(
		Array.from(lockedPaths).filter((lockedPath) => lockedPath !== sourcePath),
	)
}

export const hasLockedPathConflict = (
	paths: string[],
	lockedPaths: Iterable<string>,
): boolean => {
	return hasPathConflictWithLockedPaths(paths, lockedPaths)
}

export const isPathInsideWorkspace = (
	path: string,
	workspacePath: string,
): boolean => {
	return isPathEqualOrDescendant(path, workspacePath)
}

export const arePathsInsideWorkspace = (
	paths: string[],
	workspacePath: string,
): boolean => {
	return paths.every((path) => isPathInsideWorkspace(path, workspacePath))
}

export const isMovingIntoDescendantPath = (
	sourcePath: string,
	destinationPath: string,
): boolean => {
	return isPathEqualOrDescendant(destinationPath, sourcePath)
}
