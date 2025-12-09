import { useMemo } from 'react'
import type { WorkspaceEntry } from '@/store/workspace-store'

export function useCollectionEntries(
  currentCollectionPath: string | null,
  entries: WorkspaceEntry[],
  workspacePath: string | null
) {
  return useMemo(() => {
    if (!currentCollectionPath) {
      return []
    }

    // Handle root case: when currentCollectionPath is the workspace root,
    // entries already contains the root-level files
    if (workspacePath && currentCollectionPath === workspacePath) {
      return entries.filter(
        (entry) =>
          !entry.isDirectory && entry.name.toLowerCase().endsWith('.md')
      )
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

    // Return only markdown files (exclude folders and non-md files)
    return folderEntry.children.filter(
      (entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith('.md')
    )
  }, [currentCollectionPath, entries, workspacePath])
}
