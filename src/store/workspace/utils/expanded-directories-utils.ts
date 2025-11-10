import type { WorkspaceEntry } from '../../workspace-store'

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
  expanded: Record<string, boolean>,
  entries: WorkspaceEntry[]
): Record<string, boolean> {
  const validDirectories = new Set<string>()
  collectDirectoryPaths(entries, validDirectories)

  const normalized: Record<string, boolean> = {}

  for (const path of validDirectories) {
    if (expanded[path]) {
      normalized[path] = true
    }
  }

  return normalized
}

export function renameExpandedDirectories(
  expanded: Record<string, boolean>,
  oldPath: string,
  newPath: string
): Record<string, boolean> {
  if (oldPath === newPath) {
    return expanded
  }

  const next: Record<string, boolean> = {}
  const oldPrefix = `${oldPath}/`
  const newPrefix = `${newPath}/`

  for (const [path, isExpanded] of Object.entries(expanded)) {
    if (!isExpanded) continue

    if (path === oldPath) {
      next[newPath] = true
      continue
    }

    if (path.startsWith(oldPrefix)) {
      const suffix = path.slice(oldPrefix.length)
      next[`${newPrefix}${suffix}`] = true
      continue
    }

    next[path] = true
  }

  return next
}

export function removeExpandedDirectories(
  expanded: Record<string, boolean>,
  pathsToRemove: string[]
): Record<string, boolean> {
  const next: Record<string, boolean> = {}

  for (const [path, isExpanded] of Object.entries(expanded)) {
    if (!isExpanded) continue

    // Skip if this path or any parent path is being deleted
    let shouldSkip = false
    for (const pathToRemove of pathsToRemove) {
      if (path === pathToRemove || path.startsWith(`${pathToRemove}/`)) {
        shouldSkip = true
        break
      }
    }

    if (!shouldSkip) {
      next[path] = true
    }
  }

  return next
}
