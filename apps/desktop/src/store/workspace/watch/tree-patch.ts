import { dirname, resolve } from "pathe"
import { areStringArraysEqual } from "@/utils/array-utils"
import {
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@/utils/path-utils"
import { buildWorkspaceEntries } from "../helpers/entry-helpers"
import { syncExpandedDirectoriesWithEntries } from "../helpers/expanded-directories-helpers"
import {
	filterPinsForWorkspace,
	filterPinsWithEntries,
} from "../helpers/pinned-directories-helpers"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntry } from "../workspace-state"

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

	const sorted = Array.from(parentPaths).sort((a, b) => {
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

const replaceMultipleDirectoryChildren = (
	entries: WorkspaceEntry[],
	workspacePath: string,
	directoryChildrenByPath: ReadonlyMap<string, WorkspaceEntry[]>,
): WorkspaceEntry[] => {
	const normalizedWorkspacePath = normalizePathSeparators(workspacePath)
	if (directoryChildrenByPath.size === 0) {
		return entries
	}

	const normalizedDirectoryChildrenByPath = new Map<string, WorkspaceEntry[]>()
	for (const [directoryPath, children] of directoryChildrenByPath) {
		normalizedDirectoryChildrenByPath.set(
			normalizePathSeparators(directoryPath),
			children,
		)
	}

	if (normalizedDirectoryChildrenByPath.has(normalizedWorkspacePath)) {
		return normalizedDirectoryChildrenByPath.get(normalizedWorkspacePath) ?? []
	}

	const replaceInTree = (list: WorkspaceEntry[]): WorkspaceEntry[] => {
		let changed = false

		const updated = list.map((entry) => {
			if (!entry.isDirectory || !entry.children) {
				return entry
			}

			const normalizedEntryPath = normalizePathSeparators(entry.path)
			if (normalizedDirectoryChildrenByPath.has(normalizedEntryPath)) {
				changed = true
				return {
					...entry,
					children:
						normalizedDirectoryChildrenByPath.get(normalizedEntryPath) ?? [],
				}
			}

			const updatedChildren = replaceInTree(entry.children)
			if (updatedChildren !== entry.children) {
				changed = true
				return {
					...entry,
					children: updatedChildren,
				}
			}

			return entry
		})

		return changed ? updated : list
	}

	return replaceInTree(entries)
}

export const replaceDirectoryChildren = (
	entries: WorkspaceEntry[],
	workspacePath: string,
	directoryPath: string,
	nextChildren: WorkspaceEntry[],
): WorkspaceEntry[] => {
	return replaceMultipleDirectoryChildren(
		entries,
		workspacePath,
		new Map([[directoryPath, nextChildren]]),
	)
}

export const refreshChangedDirectories = async (
	ctx: WorkspaceActionContext,
	workspacePath: string,
	directoryPaths: string[],
) => {
	if (directoryPaths.length === 0) {
		return
	}

	const directorySnapshots = await Promise.all(
		directoryPaths.map(async (directoryPath) => ({
			directoryPath,
			children: await buildWorkspaceEntries(
				directoryPath,
				ctx.deps.fileSystemRepository,
			),
		})),
	)

	if (ctx.get().workspacePath !== workspacePath) {
		return
	}

	const nextEntries = replaceMultipleDirectoryChildren(
		ctx.get().entries,
		workspacePath,
		new Map(
			directorySnapshots.map(({ directoryPath, children }) => [
				directoryPath,
				children,
			]),
		),
	)

	const state = ctx.get()
	const previousExpanded = state.expandedDirectories
	const previousPinned = state.pinnedDirectories

	const nextExpanded = syncExpandedDirectoriesWithEntries(
		previousExpanded,
		nextEntries,
	)
	const nextPinned = filterPinsWithEntries(
		filterPinsForWorkspace(previousPinned, workspacePath),
		nextEntries,
		workspacePath,
	)
	const expandedChanged = !areStringArraysEqual(previousExpanded, nextExpanded)
	const pinnedChanged = !areStringArraysEqual(previousPinned, nextPinned)

	state.updateEntries(nextEntries)

	if (expandedChanged || pinnedChanged) {
		ctx.set({
			...(expandedChanged ? { expandedDirectories: nextExpanded } : {}),
			...(pinnedChanged ? { pinnedDirectories: nextPinned } : {}),
		})
	}

	if (expandedChanged) {
		await ctx.deps.settingsRepository.persistExpandedDirectories(
			workspacePath,
			nextExpanded,
		)
	}

	if (pinnedChanged) {
		await ctx.deps.settingsRepository.persistPinnedDirectories(
			workspacePath,
			nextPinned,
		)
	}
}
