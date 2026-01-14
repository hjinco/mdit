import type { Virtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import type { WorkspaceEntry } from '@/store/workspace/workspace-slice'

type Params = {
  folderPath: string | null
  sortedEntries: WorkspaceEntry[]
  newlyCreatedPath: string | null
  virtualizer: Virtualizer<HTMLDivElement, Element>
  onScrollComplete: () => void
}

/**
 * When notes are added to the database, scrolls to the new item
 * so it is visible (prefers the newly created path when available).
 */
export function useScrollToNewDatabaseRow({
  folderPath,
  sortedEntries,
  newlyCreatedPath,
  virtualizer,
  onScrollComplete,
}: Params) {
  const previousPathsRef = useRef<string[]>([])
  const previousFolderPathRef = useRef<string | null>(null)

  useEffect(() => {
    const isFolderChanged = previousFolderPathRef.current !== folderPath
    const previousPaths = isFolderChanged ? [] : previousPathsRef.current
    const previousPathSet = new Set(previousPaths)
    const currentPaths = sortedEntries.map((entry) => entry.path)
    const newlyAddedPaths = currentPaths.filter(
      (path) => !previousPathSet.has(path)
    )

    previousFolderPathRef.current = folderPath
    previousPathsRef.current = currentPaths

    if (isFolderChanged || newlyAddedPaths.length === 0) {
      return
    }

    const targetPath =
      newlyCreatedPath && newlyAddedPaths.includes(newlyCreatedPath)
        ? newlyCreatedPath
        : newlyAddedPaths[0]
    const targetIndex = currentPaths.indexOf(targetPath)

    if (targetIndex !== -1) {
      const behavior: ScrollBehavior =
        sortedEntries.length <= 100 ? 'smooth' : 'auto'
      virtualizer.scrollToIndex(targetIndex, { align: 'center', behavior })
      onScrollComplete()
    }
  }, [
    folderPath,
    sortedEntries,
    newlyCreatedPath,
    virtualizer,
    onScrollComplete,
  ])
}
