import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceEntry } from '@/store/workspace-store'

const ANIMATION_DURATION_MS = 100

export function useCollectionEntries(
  currentCollectionPath: string | null,
  entries: WorkspaceEntry[],
  workspacePath: string | null
): WorkspaceEntry[] {
  const computedEntries = useMemo(() => {
    if (!currentCollectionPath) {
      return []
    }

    // Handle root case: when currentCollectionPath is the workspace root,
    // entries already contains the root-level files
    if (workspacePath && currentCollectionPath === workspacePath) {
      return entries.filter((entry) => !entry.isDirectory)
    }

    // Find the folder entry by path
    const findEntryByPath = (
      nodes: WorkspaceEntry[],
      targetPath: string
    ): WorkspaceEntry | null => {
      for (const node of nodes) {
        if (node.path === targetPath) {
          return node
        }
        if (node.children) {
          const found = findEntryByPath(node.children, targetPath)
          if (found) {
            return found
          }
        }
      }
      return null
    }

    const folderEntry = findEntryByPath(entries, currentCollectionPath)

    if (!folderEntry || !folderEntry.isDirectory || !folderEntry.children) {
      return []
    }

    // Return only files (exclude folders)
    return folderEntry.children.filter((entry) => !entry.isDirectory)
  }, [currentCollectionPath, entries, workspacePath])

  const [displayedEntries, setDisplayedEntries] =
    useState<WorkspaceEntry[]>(computedEntries)

  useEffect(() => {
    if (currentCollectionPath === null) {
      // Delay clearing entries until animation completes
      const timeoutId = setTimeout(() => {
        setDisplayedEntries([])
      }, ANIMATION_DURATION_MS)

      return () => {
        clearTimeout(timeoutId)
      }
    }
    // Immediately update entries when opening
    setDisplayedEntries(computedEntries)
  }, [currentCollectionPath, computedEntries])

  return displayedEntries
}
