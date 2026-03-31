import {
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@mdit/utils/path-utils"
import { dirname, resolve } from "pathe"

export { replaceDirectoryChildren } from "../tree/reconcile"

const hasCollapsedAncestorPath = (
	path: string,
	workspacePath: string,
	collapsedSet: ReadonlySet<string>,
): boolean => {
	let currentPath = path

	while (true) {
		if (collapsedSet.has(currentPath)) {
			return true
		}

		const parentPath = normalizePathSeparators(dirname(currentPath))
		if (parentPath === currentPath) {
			return false
		}

		if (!isPathEqualOrDescendant(parentPath, workspacePath)) {
			return false
		}

		currentPath = parentPath
	}
}

export const collectRefreshDirectoryPaths = (
	workspacePath: string,
	changedRelPaths: string[],
): string[] => {
	const normalizedWorkspacePath = normalizePathSeparators(workspacePath)
	const parentPaths = new Set<string>()

	for (const relPath of changedRelPaths) {
		const absolutePath = normalizePathSeparators(
			resolve(workspacePath, relPath),
		)
		const parentPath = normalizePathSeparators(dirname(absolutePath))

		if (!isPathEqualOrDescendant(parentPath, normalizedWorkspacePath)) {
			continue
		}

		parentPaths.add(parentPath)
	}

	return collapseDirectoryPaths(
		normalizedWorkspacePath,
		Array.from(parentPaths),
	)
}

export const collapseDirectoryPaths = (
	workspacePath: string,
	directoryPaths: string[],
): string[] => {
	const normalizedWorkspacePath = normalizePathSeparators(workspacePath)
	const inWorkspacePaths = Array.from(
		new Set(
			directoryPaths
				.map((path) => normalizePathSeparators(path))
				.filter((path) =>
					isPathEqualOrDescendant(path, normalizedWorkspacePath),
				),
		),
	)
	const sorted = inWorkspacePaths.sort((a, b) => {
		if (a.length === b.length) {
			return a.localeCompare(b)
		}
		return a.length - b.length
	})
	const collapsed: string[] = []
	const collapsedSet = new Set<string>()

	for (const path of sorted) {
		if (hasCollapsedAncestorPath(path, normalizedWorkspacePath, collapsedSet)) {
			continue
		}

		collapsed.push(path)
		collapsedSet.add(path)
	}

	return collapsed
}
