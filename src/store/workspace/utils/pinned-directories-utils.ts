import { loadSettings, saveSettings } from '@/lib/settings-utils'
import {
  isPathEqualOrDescendant,
  isPathInPaths,
  normalizePathSeparators,
} from '@/utils/path-utils'
import type { WorkspaceEntry } from '../../workspace-store'
import { collectDirectoryPaths } from './expanded-directories-utils'

export async function readPinnedDirectories(
  workspacePath: string | null
): Promise<string[]> {
  if (!workspacePath) {
    return []
  }

  try {
    const settings = await loadSettings(workspacePath)
    const rawPins = settings.pinnedDirectories ?? []
    const normalized = rawPins
      .filter((entry): entry is string => typeof entry === 'string')
      .map((path) => path.trim())
      .filter(Boolean)
      .map((path) => normalizePathSeparators(path))
    return Array.from(new Set(normalized))
  } catch (error) {
    console.error('Failed to read pinned directories:', error)
    return []
  }
}

export async function persistPinnedDirectories(
  workspacePath: string | null,
  pinnedDirectories: string[]
): Promise<void> {
  if (!workspacePath) {
    return
  }

  try {
    await saveSettings(workspacePath, { pinnedDirectories })
  } catch (error) {
    console.error('Failed to save pinned directories:', error)
  }
}

export function filterPinsForWorkspace(
  pinnedDirectories: string[],
  workspacePath: string | null
): string[] {
  if (!workspacePath) return []
  return pinnedDirectories.filter((path) =>
    isPathEqualOrDescendant(path, workspacePath)
  )
}

export function removePinsForPaths(
  pinnedDirectories: string[],
  removedPaths: string[]
): string[] {
  if (removedPaths.length === 0) return pinnedDirectories
  return pinnedDirectories.filter((path) => !isPathInPaths(path, removedPaths))
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

  return Array.from(new Set(updated))
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

  return pinnedDirectories.filter((path) =>
    normalizedDirectorySet.has(normalizePathSeparators(path))
  )
}
