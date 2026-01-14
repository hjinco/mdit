import { useCallback } from 'react'
import { useStore } from '@/store'
import { getFileNameWithoutExtension } from '@/utils/path-utils'

/**
 * Hook to handle auto-renaming files based on first heading after save
 */
export function useAutoRenameOnSave(path: string) {
  const handleRenameAfterSave = useCallback(() => {
    // Check if we should rename based on tab.name (which may be from first heading)
    const { tab, linkedTab, renameEntry } = useStore.getState()

    if (tab && tab.path === path) {
      const isLinkedToCurrentTab = linkedTab && linkedTab.path === tab.path

      if (!isLinkedToCurrentTab) {
        return
      }

      const currentFileName = getFileNameWithoutExtension(path)

      // Only rename if tab.name differs from current filename and is not empty
      if (linkedTab.name !== '' && linkedTab.name !== currentFileName) {
        renameEntry(
          { path, name: linkedTab.name, isDirectory: false },
          `${linkedTab.name}.md`
        )
      }
    }
  }, [path])

  return { handleRenameAfterSave }
}
