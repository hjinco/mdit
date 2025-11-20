import { PinIcon, PinOffIcon } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/shallow'

import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/workspace-store'
import { getFolderNameFromPath } from '@/utils/path-utils'
import { useEntryMap } from '../hooks/use-entry-map'

export function PinnedList() {
  const {
    pinnedDirectories,
    currentCollectionPath,
    setCurrentCollectionPath,
    workspacePath,
    entries,
    unpinDirectory,
  } = useWorkspaceStore(
    useShallow((state) => ({
      pinnedDirectories: state.pinnedDirectories,
      currentCollectionPath: state.currentCollectionPath,
      setCurrentCollectionPath: state.setCurrentCollectionPath,
      setExpandedDirectories: state.setExpandedDirectories,
      workspacePath: state.workspacePath,
      entries: state.entries,
      unpinDirectory: state.unpinDirectory,
    }))
  )

  const entryMap = useEntryMap(entries)

  const pinnedItems = useMemo(() => {
    return pinnedDirectories
      .map((path) => {
        const entry = entryMap.get(path)
        const isWorkspaceRoot = workspacePath ? path === workspacePath : false
        const displayName =
          entry?.name ??
          (isWorkspaceRoot
            ? workspacePath
              ? getFolderNameFromPath(workspacePath)
              : path
            : getFolderNameFromPath(path))

        return {
          path,
          name: displayName,
          exists: isWorkspaceRoot || Boolean(entry),
        }
      })
      .filter((item) => item.exists)
  }, [entryMap, pinnedDirectories, workspacePath])

  const handlePinnedClick = useCallback(
    (path: string) => {
      setCurrentCollectionPath((prev) => (prev === path ? null : path))
    },
    [setCurrentCollectionPath]
  )

  const handleUnpin = useCallback(
    async (path: string) => {
      await unpinDirectory(path)
    },
    [unpinDirectory]
  )

  if (pinnedItems.length === 0) {
    return null
  }

  return (
    <div className="pb-2">
      <ul className="space-y-0.5">
        {pinnedItems.map((item) => {
          const isActive = currentCollectionPath === item.path

          return (
            <li key={item.path}>
              <div className="relative flex items-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleUnpin(item.path)
                  }}
                  className="group shrink-0 p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Unpin folder"
                >
                  <PinIcon className="size-3.5 group-hover:hidden" />
                  <PinOffIcon className="size-3.5 hidden group-hover:block" />
                </button>
                <button
                  type="button"
                  onClick={() => handlePinnedClick(item.path)}
                  className={cn(
                    'flex-1 text-left flex items-center py-0.5 text-accent-foreground/90 min-w-0 rounded-sm transition-opacity cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]',
                    isActive
                      ? 'bg-stone-100 dark:bg-stone-900 text-accent-foreground'
                      : 'hover:bg-stone-100/60 dark:hover:bg-stone-900/60'
                  )}
                >
                  <div className="relative flex-1 min-w-0 truncate">
                    <span className="text-sm">{item.name}</span>
                  </div>
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
