import { useVirtualizer } from '@tanstack/react-virtual'
import { FolderIcon, HashIcon, Loader2Icon } from 'lucide-react'
import { type MouseEvent, useCallback, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/shallow'
import { useResizablePanel } from '@/hooks/use-resizable-panel'
import { cn } from '@/lib/utils'
import { useAISettingsStore } from '@/store/ai-settings-store'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { getFolderNameFromPath } from '@/utils/path-utils'
import { isMac } from '@/utils/platform'
import { useCollectionContextMenu } from './hooks/use-collection-context-menu'
import { useCollectionEntries } from './hooks/use-collection-entries'
import { useCollectionRename } from './hooks/use-collection-rename'
import { useCollectionSelection } from './hooks/use-collection-selection'
import { useCollectionSort } from './hooks/use-collection-sort'
import { useEntryUpdateOnSave } from './hooks/use-entry-update-on-save'
import { usePreviewCache } from './hooks/use-preview-cache'
import { CollectionResizer } from './ui/collection-resizer'
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
  const { isOpen, isResizing, width, handlePointerDown } = useResizablePanel({
    storageKey: 'collection-view-width',
    defaultWidth: 240,
    minWidth: 200,
    isOpen: isCollectionViewOpen,
    setIsOpen: (open: boolean) => {
      setCurrentCollectionPath((prev) => (open ? prev : null))
    },
  })
  const { tab, linkedTab, openNote, isSaved, clearLinkedTab } = useTabStore(
    useShallow((state) => ({
      tab: state.tab,
      linkedTab: state.linkedTab,
      openNote: state.openNote,
      isSaved: state.isSaved,
      clearLinkedTab: state.clearLinkedTab,
    }))
  )

  const isFileExplorerOpen = useUIStore((state) => state.isFileExplorerOpen)
  const {
    deleteEntries,
    renameNoteWithAI,
    renameEntry,
    updateEntryModifiedDate,
  } = useWorkspaceStore(
    useShallow((state) => ({
      deleteEntries: state.deleteEntries,
      renameNoteWithAI: state.renameNoteWithAI,
      renameEntry: state.renameEntry,
      updateEntryModifiedDate: state.updateEntryModifiedDate,
    }))
  )
  const renameConfig = useAISettingsStore((state) => state.renameConfig)

  const isTagPath = currentCollectionPath?.startsWith('#') ?? false
  const tagName =
    isTagPath && currentCollectionPath ? currentCollectionPath.slice(1) : null
  const displayName = isTagPath
    ? tagName
    : currentCollectionPath
      ? getFolderNameFromPath(currentCollectionPath)
      : undefined

  const { entries: collectionEntries, isLoadingTagEntries } =
    useCollectionEntries(currentCollectionPath, entries, workspacePath)

  const {
    sortedEntries,
    sortOption,
    sortDirection,
    setSortOption,
    setSortDirection,
  } = useCollectionSort(collectionEntries, { isTagPath })

  const parentRef = useRef<HTMLDivElement>(null)
  const { getPreview, setPreview, invalidatePreview } = usePreviewCache(
    currentCollectionPath
  )
  const showTagLoadingState = isTagPath && isLoadingTagEntries

  const virtualizer = useVirtualizer({
    count: sortedEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const entry = sortedEntries[index]
      const isMarkdown = entry.name.toLowerCase().endsWith('.md')
      // NoteEntry: ~92px (name + preview + date + padding) + 4px spacing
      // FileEntry: ~36px (name + padding) + 4px spacing
      return isMarkdown ? 96 : 40
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

  // Update entry metadata (preview and modified date) when the same file is saved (not when switching files)
  useEntryUpdateOnSave(
    tab?.path,
    isSaved,
    invalidatePreview,
    updateEntryModifiedDate
  )

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
  } = useCollectionRename({
    renameEntry,
    invalidatePreview,
    onRenameSuccess: (oldPath) => {
      if (oldPath === tab?.path) {
        clearLinkedTab()
      }
    },
  })

  const handleDeleteEntries = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        return
      }

      const success = await deleteEntries(paths)

      if (success) {
        resetSelection()
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
    invalidatePreview,
  })

  return (
    <aside
      className="relative shrink-0 flex flex-col"
      style={{ width, display: isOpen ? 'flex' : 'none' }}
    >
      <div
        className={cn(
          'h-12 flex items-center justify-between px-2',
          !isFileExplorerOpen && 'justify-end'
        )}
        {...(isMac() && { 'data-tauri-drag-region': '' })}
      >
        <div
          className={cn(
            'flex items-center gap-1.5 px-1.5 shrink min-w-0 text-foreground/80',
            !isFileExplorerOpen && 'hidden'
          )}
        >
          {isTagPath ? (
            <HashIcon className="size-4.5 shrink-0" />
          ) : (
            <FolderIcon className="size-4.5 shrink-0" />
          )}
          <h2 className="text-sm font-medium truncate cursor-default">
            {displayName}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <SortSelector
            value={sortOption}
            onValueChange={setSortOption}
            sortDirection={sortDirection}
            onDirectionChange={setSortDirection}
            enableTagRelevance={isTagPath}
          />
          {!isTagPath && <NewNoteButton />}
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
        {showTagLoadingState ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              No notes in this folder
            </p>
          </div>
        ) : (
          <ul
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const entry = sortedEntries[virtualItem.index]
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

              const isMarkdown = entry.name.toLowerCase().endsWith('.md')

              return isMarkdown ? (
                <NoteEntry
                  key={entry.path}
                  entry={entry}
                  name={isActive ? (linkedTab?.name ?? tab.name) : entry.name}
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
        )}
      </div>
      <CollectionResizer
        isOpen={isOpen}
        isResizing={isResizing}
        onPointerDown={handlePointerDown}
      />
    </aside>
  )
}
