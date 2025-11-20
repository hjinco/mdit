import { loadSettings, saveSettings } from '@/lib/settings-utils'
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
  return pinnedDirectories.filter(
    (path) =>
      path === workspacePath ||
      path.startsWith(`${workspacePath}/`) ||
      path.startsWith(`${workspacePath}\\`)
  )
}

export function removePinsForPaths(
  pinnedDirectories: string[],
  removedPaths: string[]
): string[] {
  if (removedPaths.length === 0) return pinnedDirectories
  const removedSet = new Set(removedPaths)
  return pinnedDirectories.filter((path) => {
    for (const target of removedSet) {
      if (
        path === target ||
        path.startsWith(`${target}/`) ||
        path.startsWith(`${target}\\`)
      ) {
        return false
      }
    }
    return true
  })
}

export function renamePinnedDirectories(
  pinnedDirectories: string[],
  oldPath: string,
  newPath: string
): string[] {
  if (oldPath === newPath) return pinnedDirectories

  const updated = pinnedDirectories.map((path) => {
    if (path === oldPath) return newPath
    if (path.startsWith(`${oldPath}/`) || path.startsWith(`${oldPath}\\`)) {
      const suffix = path.slice(oldPath.length)
      return `${newPath}${suffix}`
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
  if (workspacePath) {
    directorySet.add(workspacePath)
  }
  return pinnedDirectories.filter((path) => directorySet.has(path))
}
