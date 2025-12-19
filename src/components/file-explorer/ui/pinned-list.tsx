import { Menu, MenuItem } from '@tauri-apps/api/menu'
import { PinIcon, PinOffIcon } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/shallow'

import { useCollectionStore } from '@/store/collection-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import {
  getFolderNameFromPath,
  normalizePathSeparators,
} from '@/utils/path-utils'
import { useEntryMap } from '../hooks/use-entry-map'
import { getEntryButtonClassName } from '../utils/entry-classnames'

export function PinnedList() {
  const { currentCollectionPath, setCurrentCollectionPath } =
    useCollectionStore(
      useShallow((state) => ({
        currentCollectionPath: state.currentCollectionPath,
        setCurrentCollectionPath: state.setCurrentCollectionPath,
      }))
    )
  const { pinnedDirectories, workspacePath, entries, unpinDirectory } =
    useWorkspaceStore(
      useShallow((state) => ({
        pinnedDirectories: state.pinnedDirectories,
        workspacePath: state.workspacePath,
        entries: state.entries,
        unpinDirectory: state.unpinDirectory,
      }))
    )

  const entryMap = useEntryMap(entries)

  const normalizedWorkspacePath = useMemo(
    () => (workspacePath ? normalizePathSeparators(workspacePath) : null),
    [workspacePath]
  )

  const pinnedItems = useMemo(() => {
    return pinnedDirectories
      .map((path) => {
        const normalizedPath = normalizePathSeparators(path)
        const entry = entryMap.get(normalizedPath) ?? entryMap.get(path)
        const isWorkspaceRoot = normalizedWorkspacePath
          ? normalizedPath === normalizedWorkspacePath
          : false
        const displayName =
          entry?.name ??
          (isWorkspaceRoot
            ? normalizedWorkspacePath
              ? getFolderNameFromPath(normalizedWorkspacePath)
              : normalizedPath
            : getFolderNameFromPath(normalizedPath))

        return {
          path: normalizedPath,
          name: displayName,
          exists: isWorkspaceRoot || Boolean(entry),
        }
      })
      .filter((item) => item.exists)
  }, [entryMap, normalizedWorkspacePath, pinnedDirectories])

  const handlePinnedClick = useCallback(
    (path: string) => {
      setCurrentCollectionPath((prev) => (prev === path ? null : path))
    },
    [setCurrentCollectionPath]
  )

  const handleUnpin = useCallback(
    async (path: string) => {
      // If the unpinned item is currently selected, clear the collection path
      if (currentCollectionPath === path) {
        setCurrentCollectionPath(null)
      }
      await unpinDirectory(path)
    },
    [currentCollectionPath, unpinDirectory, setCurrentCollectionPath]
  )

  const handleUnpinClick = useCallback(
    async (path: string, event: React.MouseEvent | React.KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      await handleUnpin(path)
    },
    [handleUnpin]
  )

  const handlePinnedContextMenu = useCallback(
    async (path: string, event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      try {
        const menu = await Menu.new({
          items: [
            await MenuItem.new({
              id: `unpin-${path}`,
              text: 'Unpin',
              action: async () => {
                // If the unpinned item is currently selected, clear the collection path
                if (currentCollectionPath === path) {
                  setCurrentCollectionPath(null)
                }
                await handleUnpin(path)
              },
            }),
          ],
        })

        await menu.popup()
      } catch (error) {
        console.error('Failed to open pinned context menu:', error)
      }
    },
    [currentCollectionPath, handleUnpin, setCurrentCollectionPath]
  )

  if (pinnedItems.length === 0) {
    return null
  }

  return (
    <div className="pb-0.5">
      <ul className="space-y-0.5">
        {pinnedItems.map((item) => {
          const isActive = currentCollectionPath === item.path

          return (
            <li key={item.path}>
              <button
                type="button"
                onClick={() => handlePinnedClick(item.path)}
                onContextMenu={(e) => handlePinnedContextMenu(item.path, e)}
                className={getEntryButtonClassName({
                  isSelected: isActive,
                })}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleUnpinClick(item.path, e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleUnpinClick(item.path, e)
                    }
                  }}
                  className="shrink-0 mx-1.75 outline-none focus-visible:ring-1 focus-visible:ring-ring/50 cursor-pointer group"
                  aria-label="Unpin folder"
                >
                  <PinIcon className="size-3.5 group-hover:hidden" />
                  <PinOffIcon className="size-3.5 hidden group-hover:block" />
                </div>
                <div className="relative flex-1 min-w-0 truncate">
                  <span className="text-sm">{item.name}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
