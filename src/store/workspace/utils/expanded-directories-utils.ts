import type { WorkspaceSettings } from '@/lib/settings-utils'
import { saveSettings } from '@/lib/settings-utils'
import {
  isPathEqualOrDescendant,
  normalizePathSeparators,
} from '@/utils/path-utils'
import type { WorkspaceEntry } from '../../workspace-store'

const DRIVE_LETTER_REGEX = /^[a-zA-Z]:\//
const isAbsolutePath = (path: string) =>
  path.startsWith('/') || DRIVE_LETTER_REGEX.test(path)

export function normalizeExpandedDirectoriesList(paths: unknown[]): string[] {
  const normalizedSet = new Set<string>()

  for (const path of paths) {
    if (typeof path !== 'string') continue
    const normalized = normalizePathSeparators(path.trim())
    if (normalized) {
      normalizedSet.add(normalized)
    }
  }

  return Array.from(normalizedSet)
}

const toRelativeExpandedPath = (
  workspacePath: string,
  directoryPath: string
): string => {
  const normalizedWorkspace = normalizePathSeparators(workspacePath)
  const normalizedPath = normalizePathSeparators(directoryPath)

  if (!normalizedWorkspace || !normalizedPath) return normalizedPath

  if (normalizedPath === normalizedWorkspace) {
    return '.'
  }

  if (normalizedPath.startsWith(`${normalizedWorkspace}/`)) {
    return normalizedPath.slice(normalizedWorkspace.length + 1)
  }

  return normalizedPath
}

const toAbsoluteExpandedPath = (
  workspacePath: string,
  directoryPath: string
): string | null => {
  const normalizedWorkspace = normalizePathSeparators(workspacePath)
  const normalizedPath = normalizePathSeparators(directoryPath)
  if (!normalizedPath) return null

  const withoutDotPrefix = normalizedPath.startsWith('./')
    ? normalizedPath.slice(2)
    : normalizedPath

  if (withoutDotPrefix === '.' || withoutDotPrefix === '') {
    return normalizedWorkspace
  }

  if (isAbsolutePath(withoutDotPrefix)) {
    return withoutDotPrefix
  }

  if (!normalizedWorkspace) return null

  return normalizePathSeparators(`${normalizedWorkspace}/${withoutDotPrefix}`)
}

export function getExpandedDirectoriesFromSettings(
  workspacePath: string | null,
  settings: WorkspaceSettings | null | undefined
): string[] {
  if (!workspacePath) {
    return []
  }

  const normalizedWorkspace = normalizePathSeparators(workspacePath)
  const storedExpanded = normalizeExpandedDirectoriesList(
    settings?.expandedDirectories ?? []
  )

  const absoluteExpanded: string[] = []

  for (const directory of storedExpanded) {
    const absolutePath = toAbsoluteExpandedPath(normalizedWorkspace, directory)

    if (
      absolutePath &&
      isPathEqualOrDescendant(absolutePath, normalizedWorkspace)
    ) {
      absoluteExpanded.push(absolutePath)
    }
  }

  return Array.from(new Set(absoluteExpanded))
}

export async function persistExpandedDirectories(
  workspacePath: string | null,
  expandedDirectories: string[]
): Promise<void> {
  if (!workspacePath) {
    return
  }

  try {
    const normalizedWorkspace = normalizePathSeparators(workspacePath)
    const filteredExpanded = normalizeExpandedDirectoriesList(
      expandedDirectories.filter((path) =>
        isPathEqualOrDescendant(path, normalizedWorkspace)
      )
    )
    const relativeExpanded = normalizeExpandedDirectoriesList(
      filteredExpanded.map((path) =>
        toRelativeExpandedPath(normalizedWorkspace, path)
      )
    )

    await saveSettings(normalizedWorkspace, {
      expandedDirectories: relativeExpanded,
    })
  } catch (error) {
    console.error('Failed to save expanded directories:', error)
  }
}

export function collectDirectoryPaths(
  entries: WorkspaceEntry[],
  accumulator: Set<string>
) {
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    accumulator.add(entry.path)
    if (entry.children) {
      collectDirectoryPaths(entry.children, accumulator)
    }
  }
}

// Drops expanded-directory flags that no longer exist in the refreshed tree.
export function syncExpandedDirectoriesWithEntries(
  expanded: string[],
  entries: WorkspaceEntry[]
): string[] {
  const validDirectories = new Set<string>()
  collectDirectoryPaths(entries, validDirectories)

  const expandedSet = new Set(expanded)
  const normalized: string[] = []

  for (const path of expandedSet) {
    if (validDirectories.has(path)) {
      normalized.push(path)
    }
  }

  return normalized
}

export function renameExpandedDirectories(
  expanded: string[],
  oldPath: string,
  newPath: string
): string[] {
  if (oldPath === newPath) {
    return expanded
  }

  const next: string[] = []
  const oldPrefix = `${oldPath}/`
  const newPrefix = `${newPath}/`

  for (const path of expanded) {
    if (path === oldPath) {
      next.push(newPath)
      continue
    }

    if (path.startsWith(oldPrefix)) {
      const suffix = path.slice(oldPrefix.length)
      next.push(`${newPrefix}${suffix}`)
      continue
    }

    next.push(path)
  }

  return next
}

export function removeExpandedDirectories(
  expanded: string[],
  pathsToRemove: string[]
): string[] {
  const next: string[] = []

  for (const path of expanded) {
    // Skip if this path or any parent path is being deleted
    let shouldSkip = false
    for (const pathToRemove of pathsToRemove) {
      if (path === pathToRemove || path.startsWith(`${pathToRemove}/`)) {
        shouldSkip = true
        break
      }
    }

    if (!shouldSkip) {
      next.push(path)
    }
  }

  return next
}

/**
 * Adds one or more directory paths to the expanded directories array.
 * Skips paths that are already in the array.
 */
export function addExpandedDirectories(
  expanded: string[],
  paths: string[]
): string[] {
  const next = [...expanded]

  for (const path of paths) {
    if (!next.includes(path)) {
      next.push(path)
    }
  }

  return next
}

/**
 * Adds a single directory path to the expanded directories array.
 * Returns the same array if the path is already present.
 */
export function addExpandedDirectory(
  expanded: string[],
  path: string
): string[] {
  if (expanded.includes(path)) {
    return expanded
  }
  return [...expanded, path]
}

/**
 * Toggles a directory path in the expanded directories array.
 * Removes it if present, adds it if not present.
 */
export function toggleExpandedDirectory(
  expanded: string[],
  path: string
): string[] {
  const isExpanded = expanded.includes(path)
  return isExpanded ? expanded.filter((p) => p !== path) : [...expanded, path]
}
