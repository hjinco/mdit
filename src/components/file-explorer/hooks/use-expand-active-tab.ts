import { useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import type { Tab } from '@/store/tab-store'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'

/**
 * Keeps the directory tree expanded so the tab that is currently active
 * is always visible. Whenever the active tab changes, we determine which
 * directories contain that file and make sure every one of those folders
 * is marked as expanded in the workspace store.
 */
export function useExpandActiveTab(entries: WorkspaceEntry[], tab: Tab | null) {
  const { expandedDirectories, setExpandedDirectories } = useWorkspaceStore(
    useShallow((state) => ({
      expandedDirectories: state.expandedDirectories,
      setExpandedDirectories: state.setExpandedDirectories,
    }))
  )

  /**
   * Finds every directory between the root of the workspace and a target path.
   * The result is a list of ancestor directory paths that need to be expanded
   * so the target path becomes visible in the tree view.
   */
  const findDirectoryAncestors = useCallback(
    (targetPath: string) => {
      // Depth-first search through the workspace tree to locate the target path.
      // `ancestors` carries the chain of directories we followed along the way.
      const search = (
        nodes: WorkspaceEntry[],
        ancestors: string[]
      ): string[] | null => {
        for (const node of nodes) {
          if (node.path === targetPath) {
            return ancestors
          }

          if (node.isDirectory && node.children?.length) {
            const result = search(node.children, [...ancestors, node.path])
            if (result) {
              return result
            }
          }
        }

        return null
      }

      return search(entries, [])
    },
    [entries]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: true
  useEffect(() => {
    const targetPath = tab?.path

    // If there is no active tab, there is nothing to expand in the tree.
    if (!targetPath) {
      return
    }

    const directoriesToExpand = findDirectoryAncestors(targetPath)

    // The target might already be visible (no ancestors to expand).
    // In that case we can exit early.
    if (!directoriesToExpand?.length) {
      return
    }

    // Only update the store when at least one ancestor is currently collapsed.
    const hasCollapsedAncestor = directoriesToExpand.some(
      (directoryPath) => !expandedDirectories[directoryPath]
    )

    if (!hasCollapsedAncestor) {
      return
    }

    // Merge the ancestor directories into the expanded map so the tree UI
    // reflects the new active tab location.
    setExpandedDirectories((prev) => {
      const nextExpanded = { ...prev }

      for (const directoryPath of directoriesToExpand) {
        nextExpanded[directoryPath] = true
      }

      return nextExpanded
    })
  }, [tab?.path])
}
