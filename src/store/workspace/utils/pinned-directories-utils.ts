import { loadSettings, saveSettings } from '@/lib/settings-utils'
import {
  isPathEqualOrDescendant,
  isPathInPaths,
  normalizePathSeparators,
} from '@/utils/path-utils'
import type { WorkspaceEntry } from '../../workspace-store'
import { collectDirectoryPaths } from './expanded-directories-utils'

const DRIVE_LETTER_REGEX = /^[a-zA-Z]:\//
const isAbsolutePath = (path: string) =>
  path.startsWith('/') || DRIVE_LETTER_REGEX.test(path)

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

const toRelativePinPath = (
  workspacePath: string,
  pinnedPath: string
): string => {
  const normalizedWorkspace = normalizePathSeparators(workspacePath)
  const normalizedPinned = normalizePathSeparators(pinnedPath)

  if (!normalizedWorkspace || !normalizedPinned) return normalizedPinned
  if (normalizedPinned === normalizedWorkspace) return '.'

  const workspacePrefix = `${normalizedWorkspace}/`
  if (normalizedPinned.startsWith(workspacePrefix)) {
    const relative = normalizedPinned.slice(workspacePrefix.length)
    return relative.length > 0 ? relative : '.'
  }

  return normalizedPinned
}

const toAbsolutePinPath = (
  workspacePath: string,
  pinnedPath: string
): string | null => {
  const normalizedWorkspace = normalizePathSeparators(workspacePath)
  const normalizedPinned = normalizePathSeparators(pinnedPath)
  if (!normalizedPinned) return null

  const withoutDotPrefix = normalizedPinned.startsWith('./')
    ? normalizedPinned.slice(2)
    : normalizedPinned

  if (withoutDotPrefix === '.' || withoutDotPrefix === '') {
    return normalizedWorkspace
  }

  if (isAbsolutePath(withoutDotPrefix)) {
    return withoutDotPrefix
  }

  if (!normalizedWorkspace) return null

  return normalizePathSeparators(`${normalizedWorkspace}/${withoutDotPrefix}`)
}

export async function readPinnedDirectories(
  workspacePath: string | null
): Promise<string[]> {
  if (!workspacePath) {
    return []
  }

  try {
    const settings = await loadSettings(workspacePath)
    const rawPins = settings.pinnedDirectories ?? []
    const normalizedPins = normalizePinnedDirectoriesList(rawPins)
    const absolutePins: string[] = []

    for (const pin of normalizedPins) {
      const absolutePath = toAbsolutePinPath(workspacePath, pin)
      if (absolutePath) {
        absolutePins.push(absolutePath)
      }
    }

    return Array.from(new Set(absolutePins))
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
    const normalizedPins = normalizePinnedDirectoriesList(pinnedDirectories)
    const relativePins = normalizePinnedDirectoriesList(
      normalizedPins.map((path) => toRelativePinPath(workspacePath, path))
    )
    await saveSettings(workspacePath, { pinnedDirectories: relativePins })
  } catch (error) {
    console.error('Failed to save pinned directories:', error)
  }
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
