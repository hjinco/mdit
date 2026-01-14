import type { WorkspaceEntry } from '../workspace-slice'

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
