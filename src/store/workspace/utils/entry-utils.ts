import { join } from '@tauri-apps/api/path'
import { readDir, stat } from '@tauri-apps/plugin-fs'

import {
  getFileNameFromPath,
  normalizePathSeparators,
} from '@/utils/path-utils'

import type { WorkspaceEntry } from '../../workspace-store'

export async function buildWorkspaceEntries(
  path: string,
  visited: Set<string> = new Set<string>()
): Promise<WorkspaceEntry[]> {
  if (visited.has(path)) {
    return []
  }

  visited.add(path)

  try {
    const rawEntries = await readDir(path)
    const visibleEntries = rawEntries.filter(
      (entry) => Boolean(entry.name) && !entry.name.startsWith('.')
    )

    const entries = await Promise.all(
      visibleEntries.map(async (entry) => {
        const fullPath = await join(path, entry.name)
        const workspaceEntry: WorkspaceEntry = {
          path: fullPath,
          name: entry.name,
          isDirectory: entry.isDirectory,
        }

        // Fetch metadata for files (not directories to avoid performance issues)
        if (!entry.isDirectory) {
          try {
            const fileMetadata = await stat(fullPath)
            if (fileMetadata.birthtime) {
              workspaceEntry.createdAt = new Date(fileMetadata.birthtime)
            }
            if (fileMetadata.mtime) {
              workspaceEntry.modifiedAt = new Date(fileMetadata.mtime)
            }
          } catch (error) {
            // Silently fail if metadata cannot be retrieved
            console.debug('Failed to get metadata for:', fullPath, error)
          }
        }

        if (entry.isDirectory) {
          try {
            if (visited.has(fullPath)) {
              console.warn(
                'Detected cyclic workspace entry, skipping recursion:',
                fullPath
              )
              workspaceEntry.children = []
            } else {
              const children = await buildWorkspaceEntries(fullPath, visited)
              workspaceEntry.children = children
            }
          } catch (error) {
            console.error('Failed to build workspace entry:', fullPath, error)
            workspaceEntry.children = []
          }
        }

        return workspaceEntry
      })
    )

    return sortWorkspaceEntries(entries)
  } catch (error) {
    console.error('Failed to read directory:', path, error)
    return []
  }
}

export function sortWorkspaceEntries(
  entries: WorkspaceEntry[]
): WorkspaceEntry[] {
  return entries
    .map((entry) => ({
      ...entry,
      children: entry.children
        ? sortWorkspaceEntries(entry.children)
        : undefined,
    }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }

      return a.name.localeCompare(b.name)
    })
}

export function removeEntriesFromState(
  entries: WorkspaceEntry[],
  pathsToRemove: string[]
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

export function findParentDirectory(
  entries: WorkspaceEntry[],
  targetPath: string
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

export function addEntryToState(
  entries: WorkspaceEntry[],
  parentPath: string,
  newEntry: WorkspaceEntry
): WorkspaceEntry[] {
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
  newName: string
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
          updateChildPaths(child, oldPath, newPath)
        )
      }
      return updated
    }
    if (entry.children) {
      return {
        ...entry,
        children: entry.children.map(updatePaths),
      }
    }
    return entry
  }

  const updateChildPaths = (
    entry: WorkspaceEntry,
    oldParentPath: string,
    newParentPath: string
  ): WorkspaceEntry => {
    // Normalize paths for consistent comparison across platforms
    const normalizedEntryPath = normalizePathSeparators(entry.path)
    const normalizedOldParentPath = normalizePathSeparators(oldParentPath)
    const normalizedNewParentPath = normalizePathSeparators(newParentPath)

    const relativePath = normalizedEntryPath.startsWith(
      `${normalizedOldParentPath}/`
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
        updateChildPaths(child, oldParentPath, newParentPath)
      )
    }

    return updated
  }

  return entries.map(updatePaths)
}

export function updateChildPathsForMove(
  entry: WorkspaceEntry,
  oldParentPath: string,
  newParentPath: string
): WorkspaceEntry {
  // Normalize paths for consistent comparison across platforms
  const normalizedEntryPath = normalizePathSeparators(entry.path)
  const normalizedOldParentPath = normalizePathSeparators(oldParentPath)
  const normalizedNewParentPath = normalizePathSeparators(newParentPath)

  const relativePath = normalizedEntryPath.startsWith(
    `${normalizedOldParentPath}/`
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
      updateChildPathsForMove(child, oldParentPath, newParentPath)
    )
  }

  return updated
}

export function moveEntryInState(
  entries: WorkspaceEntry[],
  sourcePath: string,
  destinationPath: string
): WorkspaceEntry[] {
  // Helper function to find entry by path
  const findEntry = (
    entryList: WorkspaceEntry[],
    targetPath: string
  ): WorkspaceEntry | null => {
    for (const entry of entryList) {
      if (entry.path === targetPath) {
        return entry
      }
      if (entry.children) {
        const found = findEntry(entry.children, targetPath)
        if (found) {
          return found
        }
      }
    }
    return null
  }

  // Find the entry to move
  const entryToMove = findEntry(entries, sourcePath)
  if (!entryToMove) {
    return entries
  }

  // Remove entry from source location
  const removeEntry = (entryList: WorkspaceEntry[]): WorkspaceEntry[] => {
    return entryList
      .filter((entry) => entry.path !== sourcePath)
      .map((entry) => {
        if (entry.children) {
          return {
            ...entry,
            children: removeEntry(entry.children),
          }
        }
        return entry
      })
  }

  const filteredEntries = removeEntry(entries)

  // Update paths if it's a directory
  const fileName = getFileNameFromPath(sourcePath)
  const normalizedDestinationPath = normalizePathSeparators(destinationPath)
  const newPath = `${normalizedDestinationPath}/${fileName}`

  let updatedEntryToMove: WorkspaceEntry
  if (entryToMove.isDirectory) {
    updatedEntryToMove = {
      path: newPath,
      name: entryToMove.name,
      isDirectory: true,
      children: entryToMove.children
        ? entryToMove.children.map((child: WorkspaceEntry) =>
            updateChildPathsForMove(child, sourcePath, newPath)
          )
        : undefined,
      createdAt: entryToMove.createdAt,
      modifiedAt: entryToMove.modifiedAt,
    }
  } else {
    updatedEntryToMove = {
      path: newPath,
      name: entryToMove.name,
      isDirectory: false,
      createdAt: entryToMove.createdAt,
      modifiedAt: entryToMove.modifiedAt,
    }
  }

  // Add entry to destination
  const addToDestination = (
    entryList: WorkspaceEntry[],
    targetPath: string
  ): WorkspaceEntry[] => {
    return entryList.map((entry) => {
      if (entry.path === targetPath && entry.isDirectory) {
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

  return addToDestination(filteredEntries, destinationPath)
}
