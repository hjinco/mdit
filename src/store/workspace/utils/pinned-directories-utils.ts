import {
  isPathEqualOrDescendant,
  isPathInPaths,
  normalizePathSeparators,
} from '@/utils/path-utils'
import type { WorkspaceEntry } from '../../workspace-store'
import { collectDirectoryPaths } from './expanded-directories-utils'

export function normalizePinnedDirectoriesList(paths: unknown[]): string[] {
  const normalizedSet = new Set<string>()

  for (const path of paths) {
    if (typeof path !== 'string') continue
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
  workspacePath: string | null
): string[] {
  if (!workspacePath) return []
  return normalizePinnedDirectoriesList(
    pinnedDirectories.filter((path) =>
      isPathEqualOrDescendant(path, workspacePath)
    )
  )
}

export function removePinsForPaths(
  pinnedDirectories: string[],
  removedPaths: string[]
): string[] {
  if (removedPaths.length === 0) return pinnedDirectories
  return normalizePinnedDirectoriesList(
    pinnedDirectories.filter((path) => !isPathInPaths(path, removedPaths))
  )
}

export function renamePinnedDirectories(
  pinnedDirectories: string[],
  oldPath: string,
  newPath: string
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

export function filterPinsWithEntries(
  pinnedDirectories: string[],
  entries: WorkspaceEntry[],
  workspacePath?: string | null
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
      normalizedDirectorySet.has(normalizePathSeparators(path))
    )
  )
}
