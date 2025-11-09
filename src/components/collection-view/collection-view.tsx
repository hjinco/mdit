import { useVirtualizer } from '@tanstack/react-virtual'
import { FolderIcon } from 'lucide-react'
import { type MouseEvent, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import { useResizablePanel } from '@/hooks/use-resizable-panel'
import { cn } from '@/lib/utils'
import { useAISettingsStore } from '@/store/ai-settings-store'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { useCollectionContextMenu } from './hooks/use-collection-context-menu'
import { useCollectionEntries } from './hooks/use-collection-entries'
import { useCollectionRename } from './hooks/use-collection-rename'
import { useCollectionSelection } from './hooks/use-collection-selection'
import { useCollectionSort } from './hooks/use-collection-sort'
import { usePreviewCache } from './hooks/use-preview-cache'
import { usePreviewInvalidation } from './hooks/use-preview-invalidation'
import { NewNoteButton } from './ui/new-note-button'
import { NoteEntry } from './ui/note-entry'
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
  const { tab, openNote, isSaved } = useTabStore(
    useShallow((state) => ({
      tab: state.tab,
      openNote: state.openNote,
      isSaved: state.isSaved,
    }))
  )

  const isFileExplorerOpen = useUIStore((state) => state.isFileExplorerOpen)
  const { deleteEntries, renameNoteWithAI, renameEntry } = useWorkspaceStore(
    useShallow((state) => ({
      deleteEntries: state.deleteEntries,
      renameNoteWithAI: state.renameNoteWithAI,
      renameEntry: state.renameEntry,
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

  const parentRef = useRef<HTMLDivElement>(null)
  const { getPreview, setPreview, invalidatePreview } = usePreviewCache(
    currentCollectionPath
  )

  const virtualizer = useVirtualizer({
    count: sortedEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const entry = sortedEntries[index]
      const isMarkdown = entry.name.toLowerCase().endsWith('.md')
      // NoteEntry: ~76px (name + preview + padding) + 4px spacing
      // FileEntry: ~36px (name + padding) + 4px spacing
      return isMarkdown ? 80 : 40
    },
    overscan: 5,
  })

  const entryOrderMap = useMemo(() => {
    const map = new Map<string, number>()
    sortedEntries.forEach((entry, index) => {
      map.set(entry.path, index)
    })
    return map
  }, [sortedEntries])

  // Invalidate preview when the same file is saved (not when switching files)
  usePreviewInvalidation(tab?.path, isSaved, invalidatePreview)

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

  const {
    renamingEntryPath,
    beginRenaming,
    cancelRenaming,
    handleRenameSubmit,
  } = useCollectionRename({ renameEntry })

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
    beginRenaming,
    handleDeleteEntries,
    selectedEntryPaths,
    setSelectedEntryPaths,
    setSelectionAnchorPath,
    resetSelection,
  })

  return (
    <aside
      className={cn(
        'relative shrink-0 flex flex-col shadow-lg border-r',
        isResizing ? 'transition-none' : 'transition-[width] ease-out',
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
        ref={(el) => {
          parentRef.current = el
        }}
        className="flex-1 overflow-y-auto px-3"
        onClick={() => {
          setSelectedEntryPaths(new Set())
        }}
      >
        {sortedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              No notes in this folder
            </p>
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            <ul>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const entry = sortedEntries[virtualItem.index]
                const isActive = tab?.path === entry.path
                const isSelected = selectedEntryPaths.has(entry.path)

                const handleClick = (event: MouseEvent<HTMLLIElement>) => {
                  handleEntryPrimaryAction(entry, event)
                }

                const handleContextMenu = (
                  event: MouseEvent<HTMLLIElement>
                ) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleEntryContextMenu(entry)
                }

                const isMarkdown = entry.name.toLowerCase().endsWith('.md')

                return isMarkdown ? (
                  <NoteEntry
                    key={entry.path}
                    entry={entry}
                    isActive={isActive}
                    isSelected={isSelected}
                    onClick={handleClick}
                    onContextMenu={handleContextMenu}
                    previewText={getPreview(entry.path)}
                    setPreview={setPreview}
                    isRenaming={renamingEntryPath === entry.path}
                    onRenameSubmit={handleRenameSubmit}
                    onRenameCancel={cancelRenaming}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    data-index={virtualItem.index}
                  />
                ) : null
                // ) : (
                //   <FileEntry
                //     key={entry.path}
                //     entry={entry}
                //     isActive={isActive}
                //     isSelected={isSelected}
                //     onClick={handleClick}
                //     onContextMenu={handleContextMenu}
                //     style={{
                //       position: 'absolute',
                //       top: 0,
                //       left: 0,
                //       width: '100%',
                //       transform: `translateY(${virtualItem.start}px)`,
                //     }}
                //     data-index={virtualItem.index}
                //   />
                // )
              })}
            </ul>
          </div>
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
