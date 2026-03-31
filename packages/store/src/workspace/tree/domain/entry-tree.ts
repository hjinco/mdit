import {
	getFileNameFromPath,
	normalizePathSeparators,
} from "@mdit/utils/path-utils"
import type { WorkspaceEntry } from "../../workspace-state"

const EMPTY_CHILDREN: WorkspaceEntry[] = []

function isUntitledNote(name: string): boolean {
	if (!name.endsWith(".md")) {
		return false
	}
	const nameWithoutExtension = name.slice(0, -3) // Remove '.md'
	return nameWithoutExtension.startsWith("Untitled")
}

export function findEntryByPath(
	entries: WorkspaceEntry[],
	targetPath: string,
): WorkspaceEntry | null {
	for (const entry of entries) {
		if (entry.path === targetPath) {
			return entry
		}
		if (entry.children) {
			const found = findEntryByPath(entry.children, targetPath)
			if (found) {
				return found
			}
		}
	}
	return null
}

export function findParentDirectory(
	entries: WorkspaceEntry[],
	targetPath: string,
): WorkspaceEntry | null {
	for (const entry of entries) {
		if (entry.isDirectory) {
			if (entry.path === targetPath) {
				return entry
			}
			if (entry.children) {
				const found = findParentDirectory(entry.children, targetPath)
				if (found) {
					return found
				}
			}
		}
	}
	return null
}

export function sortWorkspaceEntries(
	entries: WorkspaceEntry[],
	options?: { recursive?: boolean },
): WorkspaceEntry[] {
	const recursive = options?.recursive ?? true
	return entries
		.map((entry) => ({
			...entry,
			children: entry.children
				? recursive
					? sortWorkspaceEntries(entry.children, options)
					: entry.children
				: undefined,
		}))
		.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) {
				return a.isDirectory ? -1 : 1
			}

			// For files, prioritize "Untitled" notes
			if (!a.isDirectory && !b.isDirectory) {
				const aIsUntitled = isUntitledNote(a.name)
				const bIsUntitled = isUntitledNote(b.name)

				if (aIsUntitled !== bIsUntitled) {
					return aIsUntitled ? -1 : 1
				}
			}

			return a.name.localeCompare(b.name)
		})
}

export function removeEntriesFromState(
	entries: WorkspaceEntry[],
	pathsToRemove: string[],
): WorkspaceEntry[] {
	const pathsSet = new Set(pathsToRemove)

	return entries
		.filter((entry) => !pathsSet.has(entry.path))
		.map((entry) => {
			if (entry.children) {
				return {
					...entry,
					children: removeEntriesFromState(entry.children, pathsToRemove),
				}
			}
			return entry
		})
}

export function removeEntryFromState(
	entries: WorkspaceEntry[],
	pathToRemove: string,
): WorkspaceEntry[] {
	return removeEntriesFromState(entries, [pathToRemove])
}

export function addEntryToState(
	entries: WorkspaceEntry[],
	parentPath: string,
	newEntry: WorkspaceEntry,
): WorkspaceEntry[] {
	// Check if entry with the same path already exists to avoid duplicates
	const existingEntry = findEntryByPath(entries, newEntry.path)
	if (existingEntry) {
		// Entry already exists, return entries as-is
		return entries
	}

	const parent = findParentDirectory(entries, parentPath)

	if (!parent) {
		// Parent not found, return entries as-is
		return entries
	}

	const addToChildren = (children: WorkspaceEntry[]): WorkspaceEntry[] => {
		const updated = [...children, newEntry]
		return sortWorkspaceEntries(updated)
	}

	const updateEntry = (entry: WorkspaceEntry): WorkspaceEntry => {
		if (entry.path === parentPath) {
			return {
				...entry,
				children: entry.children ? addToChildren(entry.children) : [newEntry],
			}
		}
		if (entry.children) {
			return {
				...entry,
				children: entry.children.map(updateEntry),
			}
		}
		return entry
	}

	return entries.map(updateEntry)
}

export function updateEntryInState(
	entries: WorkspaceEntry[],
	oldPath: string,
	newPath: string,
	newName: string,
): WorkspaceEntry[] {
	const updatePaths = (entry: WorkspaceEntry): WorkspaceEntry => {
		if (entry.path === oldPath) {
			const updated: WorkspaceEntry = {
				...entry,
				path: newPath,
				name: newName,
			}
			if (entry.isDirectory && entry.children) {
				// Recursively update all children paths
				updated.children = entry.children.map((child) =>
					updateChildPaths(child, oldPath, newPath),
				)
			}
			return updated
		}
		if (entry.children) {
			const updatedChildren = entry.children.map(updatePaths)
			// Sort children after updating (name may have changed, affecting sort order)
			return {
				...entry,
				children: sortWorkspaceEntries(updatedChildren, { recursive: false }),
			}
		}
		return entry
	}

	const updateChildPaths = (
		entry: WorkspaceEntry,
		oldParentPath: string,
		newParentPath: string,
	): WorkspaceEntry => {
		// Normalize paths for consistent comparison across platforms
		const normalizedEntryPath = normalizePathSeparators(entry.path)
		const normalizedOldParentPath = normalizePathSeparators(oldParentPath)
		const normalizedNewParentPath = normalizePathSeparators(newParentPath)

		const relativePath = normalizedEntryPath.startsWith(
			`${normalizedOldParentPath}/`,
		)
			? normalizedEntryPath.slice(normalizedOldParentPath.length + 1)
			: getFileNameFromPath(entry.path)

		const updatedPath = `${normalizedNewParentPath}/${relativePath}`
		const updated: WorkspaceEntry = {
			...entry,
			path: updatedPath,
		}

		if (entry.isDirectory && entry.children) {
			updated.children = entry.children.map((child) =>
				updateChildPaths(child, oldParentPath, newParentPath),
			)
		}

		return updated
	}

	const updatedEntries = entries.map(updatePaths)
	// Sort root entries after updating (name may have changed, affecting sort order)
	return sortWorkspaceEntries(updatedEntries, { recursive: false })
}

export function updateChildPathsForMove(
	entry: WorkspaceEntry,
	oldParentPath: string,
	newParentPath: string,
): WorkspaceEntry {
	// Normalize paths for consistent comparison across platforms
	const normalizedEntryPath = normalizePathSeparators(entry.path)
	const normalizedOldParentPath = normalizePathSeparators(oldParentPath)
	const normalizedNewParentPath = normalizePathSeparators(newParentPath)

	const relativePath = normalizedEntryPath.startsWith(
		`${normalizedOldParentPath}/`,
	)
		? normalizedEntryPath.slice(normalizedOldParentPath.length + 1)
		: getFileNameFromPath(entry.path)

	const updatedPath = `${normalizedNewParentPath}/${relativePath}`
	const updated: WorkspaceEntry = {
		...entry,
		path: updatedPath,
	}

	if (entry.isDirectory && entry.children) {
		updated.children = entry.children.map((child) =>
			updateChildPathsForMove(child, oldParentPath, newParentPath),
		)
	}

	return updated
}

export function moveEntryInState(
	entries: WorkspaceEntry[],
	sourcePath: string,
	destinationPath: string,
	workspacePath?: string,
	newPath?: string,
): WorkspaceEntry[] {
	// Find the entry to move
	const entryToMove = findEntryByPath(entries, sourcePath)
	if (!entryToMove) {
		return entries
	}

	// Remove entry from source location
	const filteredEntries = removeEntryFromState(entries, sourcePath)

	// Update paths if it's a directory
	const normalizedDestinationPath = normalizePathSeparators(destinationPath)
	// Handle root path construction: avoid double slashes
	const computedNewPath =
		normalizedDestinationPath === "/" || normalizedDestinationPath === ""
			? `/${getFileNameFromPath(sourcePath)}`
			: `${normalizedDestinationPath}/${getFileNameFromPath(sourcePath)}`
	const targetPath = normalizePathSeparators(newPath ?? computedNewPath)
	const targetName = getFileNameFromPath(targetPath)

	let updatedEntryToMove: WorkspaceEntry
	if (entryToMove.isDirectory) {
		updatedEntryToMove = {
			path: targetPath,
			name: targetName,
			isDirectory: true,
			children: entryToMove.children
				? entryToMove.children.map((child: WorkspaceEntry) =>
						updateChildPathsForMove(child, sourcePath, targetPath),
					)
				: EMPTY_CHILDREN,
			createdAt: entryToMove.createdAt,
			modifiedAt: entryToMove.modifiedAt,
		}
	} else {
		updatedEntryToMove = {
			path: targetPath,
			name: targetName,
			isDirectory: false,
			children: undefined,
			createdAt: entryToMove.createdAt,
			modifiedAt: entryToMove.modifiedAt,
		}
	}

	// Handle moves to workspace root
	// Normalize both paths for comparison to handle platform differences
	const normalizedWorkspacePath = workspacePath
		? normalizePathSeparators(workspacePath)
		: null
	if (
		normalizedWorkspacePath &&
		normalizedDestinationPath === normalizedWorkspacePath
	) {
		return sortWorkspaceEntries([...filteredEntries, updatedEntryToMove])
	}

	// Add entry to destination subdirectory
	let inserted = false
	const addToDestination = (
		entryList: WorkspaceEntry[],
		targetPath: string,
	): WorkspaceEntry[] => {
		return entryList.map((entry) => {
			if (entry.path === targetPath && entry.isDirectory) {
				inserted = true
				const updatedChildren = entry.children
					? [...entry.children, updatedEntryToMove]
					: [updatedEntryToMove]
				return {
					...entry,
					children: sortWorkspaceEntries(updatedChildren),
				}
			}
			if (entry.children) {
				return {
					...entry,
					children: addToDestination(entry.children, targetPath),
				}
			}
			return entry
		})
	}

	const movedEntries = addToDestination(filteredEntries, destinationPath)
	return inserted ? movedEntries : entries
}

export function updateEntryMetadata(
	entries: WorkspaceEntry[],
	targetPath: string,
	metadata: { modifiedAt?: Date; createdAt?: Date },
): WorkspaceEntry[] {
	const updateEntry = (entry: WorkspaceEntry): WorkspaceEntry => {
		if (entry.path === targetPath) {
			return {
				...entry,
				...(metadata.modifiedAt !== undefined && {
					modifiedAt: metadata.modifiedAt,
				}),
				...(metadata.createdAt !== undefined && {
					createdAt: metadata.createdAt,
				}),
			}
		}
		if (entry.children) {
			return {
				...entry,
				children: entry.children.map(updateEntry),
			}
		}
		return entry
	}

	return entries.map(updateEntry)
}
