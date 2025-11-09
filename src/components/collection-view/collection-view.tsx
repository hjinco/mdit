import { dirname } from '@tauri-apps/api/path'
import { FileTextIcon, FolderIcon, ImageIcon } from 'lucide-react'
import { type MouseEvent, useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import { useResizablePanel } from '@/hooks/use-resizable-panel'
import { cn } from '@/lib/utils'
import { useAISettingsStore } from '@/store/ai-settings-store'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { isImageFile } from '@/utils/file-icon'
import { useCollectionContextMenu } from './hooks/use-collection-context-menu'
import { useCollectionEntries } from './hooks/use-collection-entries'
import { useCollectionSelection } from './hooks/use-collection-selection'
import { useCollectionSort } from './hooks/use-collection-sort'
import { NewNoteButton } from './ui/new-note-button'
import { SortSelector } from './ui/sort-selector'

export function CollectionView() {
  const {
    currentCollectionPath,
    entries,
    workspacePath,
    setCurrentCollectionPath,
  } = useWorkspaceStore(
    useShallow((state) => ({
      currentCollectionPath: state.currentCollectionPath,
      entries: state.entries,
      workspacePath: state.workspacePath,
      setCurrentCollectionPath: state.setCurrentCollectionPath,
    }))
  )
  const isCollectionViewOpen = currentCollectionPath !== null
  const { isOpen, width, isResizing, handlePointerDown } = useResizablePanel({
    storageKey: 'collection-view-width',
    defaultWidth: 256,
    minWidth: 200,
    isOpen: isCollectionViewOpen,
    setIsOpen: (open: boolean) => {
      setCurrentCollectionPath((prev) => (open ? prev : null))
    },
  })
  const { tab, openNote } = useTabStore(
    useShallow((state) => ({ tab: state.tab, openNote: state.openNote }))
  )

  useEffect(() => {
    if (!isOpen) {
      return
    }
    if (tab?.path) {
      dirname(tab.path)
        .then((folderPath) => {
          setCurrentCollectionPath(folderPath)
        })
        .catch((error) => {
          console.error('Failed to get directory path from tab:', error)
        })
    }
  }, [tab?.path, setCurrentCollectionPath, isOpen])

  const isFileExplorerOpen = useUIStore((state) => state.isFileExplorerOpen)
  const { deleteEntries, renameNoteWithAI } = useWorkspaceStore(
    useShallow((state) => ({
      deleteEntries: state.deleteEntries,
      renameNoteWithAI: state.renameNoteWithAI,
    }))
  )
  const renameConfig = useAISettingsStore((state) => state.renameConfig)

  const collectionEntries = useCollectionEntries(
    currentCollectionPath,
    entries,
    workspacePath
  )

  const {
    sortedEntries,
    sortOption,
    sortDirection,
    setSortOption,
    setSortDirection,
  } = useCollectionSort(collectionEntries)

  const entryOrderMap = useMemo(() => {
    const map = new Map<string, number>()
    sortedEntries.forEach((entry, index) => {
      map.set(entry.path, index)
    })
    return map
  }, [sortedEntries])

  const {
    selectedEntryPaths,
    setSelectedEntryPaths,
    setSelectionAnchorPath,
    resetSelection,
    handleEntryPrimaryAction,
  } = useCollectionSelection({
    entryOrderMap,
    sortedEntries,
    openNote,
  })

  const handleDeleteEntries = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        return
      }

      const success = await deleteEntries(paths)

      if (success) {
        resetSelection()
      } else {
        toast.error('Failed to delete')
      }
    },
    [deleteEntries, resetSelection]
  )

  const { handleEntryContextMenu } = useCollectionContextMenu({
    renameConfig,
    renameNoteWithAI,
    handleDeleteEntries,
    selectedEntryPaths,
    setSelectedEntryPaths,
    setSelectionAnchorPath,
    resetSelection,
  })

  return (
    <aside
      className={cn(
        'font-scale-scope relative shrink-0 flex flex-col bg-background shadow-md border-r',
        isResizing
          ? 'transition-none'
          : 'transition-[width] ease-out duration-150',
        !isOpen && 'overflow-hidden pointer-events-none'
      )}
      style={{ width: isOpen ? width : 0 }}
    >
      <div
        className={cn(
          'h-12 flex items-center justify-between px-2',
          !isFileExplorerOpen && 'justify-end'
        )}
        data-tauri-drag-region
      >
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 shrink min-w-0 text-foreground/80',
            !isFileExplorerOpen && 'hidden'
          )}
        >
          <FolderIcon className="size-4.5 shrink-0" />
          <h2 className="text-sm font-medium truncate cursor-default">
            {currentCollectionPath?.split('/').pop()}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <SortSelector
            value={sortOption}
            onValueChange={setSortOption}
            sortDirection={sortDirection}
            onDirectionChange={setSortDirection}
          />
          <NewNoteButton />
        </div>
      </div>
      <div
        className="flex-1 overflow-y-auto"
        onClick={() => {
          setSelectedEntryPaths(new Set())
        }}
      >
        {sortedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No notes in this folder
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5 px-2">
            {sortedEntries.map((entry) => {
              const isActive = tab?.path === entry.path
              const isSelected = selectedEntryPaths.has(entry.path)

              const handleClick = (event: MouseEvent<HTMLLIElement>) => {
                handleEntryPrimaryAction(entry, event)
              }

              const handleContextMenu = (event: MouseEvent<HTMLLIElement>) => {
                event.preventDefault()
                event.stopPropagation()
                handleEntryContextMenu(entry)
              }

              // Remove extension from display name
              const lastDotIndex = entry.name.lastIndexOf('.')
              const displayName =
                lastDotIndex > 0
                  ? entry.name.slice(0, lastDotIndex)
                  : entry.name

              // Check if file is an image
              const extension =
                lastDotIndex > 0 ? entry.name.slice(lastDotIndex) : ''
              const isImage = isImageFile(extension)

              return (
                <li
                  key={entry.path}
                  onClick={handleClick}
                  onContextMenu={handleContextMenu}
                  className={cn(
                    'px-2 py-1 text-sm text-foreground/80 rounded-sm flex items-center gap-2',
                    'hover:bg-muted',
                    (isActive || isSelected) && 'bg-accent'
                  )}
                >
                  {isImage ? (
                    <ImageIcon className="size-4 shrink-0" />
                  ) : (
                    <FileTextIcon className="size-4 shrink-0" />
                  )}
                  <span className="truncate cursor-default">{displayName}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {isOpen && (
        <div
          className="absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize bg-transparent"
          onPointerDown={handlePointerDown}
        />
      )}
    </aside>
  )
}
