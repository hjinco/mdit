import {
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@/utils/path-utils"
import type { WorkspaceEntry } from "../../workspace-state"
import { collectDirectoryPaths } from "./expanded-directories-helpers"

export function normalizePinnedDirectoriesList(paths: unknown[]): string[] {
	const normalizedSet = new Set<string>()

	for (const path of paths) {
		if (typeof path !== "string") continue
		const trimmed = path.trim()
		if (!trimmed) continue
		const normalized = normalizePathSeparators(trimmed)
		if (normalized) {
			normalizedSet.add(normalized)
		}
	}

	return Array.from(normalizedSet)
}

export function filterPinsForWorkspace(
	pinnedDirectories: string[],
	workspacePath: string | null,
): string[] {
	if (!workspacePath) return []
	return normalizePinnedDirectoriesList(
		pinnedDirectories.filter((path) =>
			isPathEqualOrDescendant(path, workspacePath),
		),
	)
}

export function filterPinsWithEntries(
	pinnedDirectories: string[],
	entries: WorkspaceEntry[],
	workspacePath?: string | null,
): string[] {
	if (pinnedDirectories.length === 0) return pinnedDirectories
	const directorySet = new Set<string>()
	collectDirectoryPaths(entries, directorySet)

	// Normalize all paths in the set for consistent comparison
	const normalizedDirectorySet = new Set<string>()
	for (const path of directorySet) {
		normalizedDirectorySet.add(normalizePathSeparators(path))
	}

	if (workspacePath) {
		normalizedDirectorySet.add(normalizePathSeparators(workspacePath))
	}

	return normalizePinnedDirectoriesList(
		pinnedDirectories.filter((path) =>
			normalizedDirectorySet.has(normalizePathSeparators(path)),
		),
	)
}
