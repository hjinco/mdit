import { useCallback } from 'react'
import { useTabStore } from '@/store/tab-store'
import type { WorkspaceEntry } from '@/store/workspace-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { getFileNameWithoutExtension } from '@/utils/path-utils'

/**
 * Sanitize a string to be used as a filename by removing invalid characters
 */
function sanitizeFilename(text: string): string {
  // Remove invalid filename characters: / \ : * ? " < > |
  return text.replace(/[/\\:*?"<>|]/g, '').trim()
}

/**
 * Find a WorkspaceEntry by path in the entries tree
 */
function findEntryByPath(
  entries: WorkspaceEntry[],
  targetPath: string
): WorkspaceEntry | null {
  for (const entry of entries) {
    if (entry.path === targetPath) {
      return entry
    }
    if (entry.children) {
      const found = findEntryByPath(entry.children, targetPath)
      if (found) {
        return found
      }
    }
  }
  return null
}

/**
 * Hook to handle auto-renaming files based on first heading after save
 */
export function useAutoRenameOnSave(path: string) {
  const handleRenameAfterSave = useCallback(() => {
    // Check if we should rename based on tab.name (which may be from first heading)
    const { tab } = useTabStore.getState()
    const { entries, renameEntry } = useWorkspaceStore.getState()

    if (tab && tab.path === path) {
      const sanitizedName = sanitizeFilename(tab.name)
      const currentFileName = getFileNameWithoutExtension(path)

      // Only rename if tab.name differs from current filename and is not empty
      if (sanitizedName && sanitizedName !== currentFileName) {
        const entry = findEntryByPath(entries, path)
        if (entry) {
          renameEntry(entry, `${sanitizedName}.md`).catch((error) => {
            console.error('Failed to rename file based on tab name:', error)
            // Don't block save operation on rename failure
          })
        }
      }
    }
  }, [path])

  return { handleRenameAfterSave }
}
