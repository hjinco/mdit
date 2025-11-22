import { useDroppable } from '@dnd-kit/core'
import { type MouseEvent, useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import { useAutoCloseSidebars } from '@/hooks/use-auto-close-sidebars'
import { useResizablePanel } from '@/hooks/use-resizable-panel'
import { cn } from '@/lib/utils'
import { useAISettingsStore } from '@/store/ai-settings-store'
import { useFileExplorerSelectionStore } from '@/store/file-explorer-selection-store'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'
import { isImageFile } from '@/utils/file-icon'
import { useFileExplorerMenus } from './hooks/use-context-menus'
import { useEnterToRename } from './hooks/use-enter-to-rename'
import { useEntryMap } from './hooks/use-entry-map'
import { FeedbackButton } from './ui/feedback-button'
import { GitSyncStatus } from './ui/git-sync-status'
import { PinnedList } from './ui/pinned-list'
import { SettingsMenu } from './ui/settings-menu'
import { TagList } from './ui/tag-list'
import { TopMenu } from './ui/top-menu'
import { TreeNode } from './ui/tree-node'
import { WorkspaceDropdown } from './ui/workspace-dropdown'

export function FileExplorer() {
  const fileExplorerRef = useRef<HTMLElement | null>(null)
  const { isFileExplorerOpen, setFileExplorerOpen } = useUIStore(
    useShallow((state) => ({
      isFileExplorerOpen: state.isFileExplorerOpen,
      setFileExplorerOpen: state.setFileExplorerOpen,
    }))
  )
  const { isOpen, width, isResizing, handlePointerDown } = useResizablePanel({
    storageKey: 'file-explorer-width',
    defaultWidth: 256,
    minWidth: 160,
    isOpen: isFileExplorerOpen,
    setIsOpen: setFileExplorerOpen,
  })
  const {
    workspacePath,
    entries,
    expandedDirectories,
    recentWorkspacePaths,
    createNote,
    createFolder,
    deleteEntries,
    renameNoteWithAI,
    renameEntry,
    toggleDirectory,
    setWorkspace,
    openFolderPicker,
    setCurrentCollectionPath,
    pinnedDirectories,
    pinDirectory,
    unpinDirectory,
  } = useWorkspaceStore()
  const { tab, openNote } = useTabStore(
    useShallow((s) => ({ tab: s.tab, openNote: s.openNote }))
  )
  const renameConfig = useAISettingsStore((state) => state.renameConfig)
  const openImagePreview = useUIStore((state) => state.openImagePreview)
  const [renamingEntryPath, setRenamingEntryPath] = useState<string | null>(
    null
  )
  const [aiRenamingEntryPaths, setAiRenamingEntryPaths] = useState<Set<string>>(
    () => new Set()
  )
  const {
    selectedEntryPaths,
    selectionAnchorPath,
    setSelectedEntryPaths,
    setSelectionAnchorPath,
    resetSelection,
  } = useFileExplorerSelectionStore(
    useShallow((state) => ({
      selectedEntryPaths: state.selectedEntryPaths,
      selectionAnchorPath: state.selectionAnchorPath,
      setSelectedEntryPaths: state.setSelectedEntryPaths,
      setSelectionAnchorPath: state.setSelectionAnchorPath,
      resetSelection: state.resetSelection,
    }))
  )
  const visibleEntryPaths = useMemo(() => {
    const paths: string[] = []

    const traverse = (nodes: WorkspaceEntry[]) => {
      for (const node of nodes) {
        paths.push(node.path)
        if (
          node.isDirectory &&
          expandedDirectories[node.path] &&
          node.children
        ) {
          traverse(node.children)
        }
      }
    }

    traverse(entries)
    return paths
  }, [entries, expandedDirectories])

  const entryOrderMap = useMemo(() => {
    const map = new Map<string, number>()
    visibleEntryPaths.forEach((path, index) => {
      map.set(path, index)
    })
    return map
  }, [visibleEntryPaths])
  const entryMap = useEntryMap(entries)

  // Setup workspace root as a drop target
  const { setNodeRef: setWorkspaceDropRef, isOver: isOverWorkspace } =
    useDroppable({
      id: `droppable-${workspacePath}`,
      data: {
        path: workspacePath,
        isDirectory: true,
        depth: -1,
      },
      disabled: !workspacePath,
    })

  const beginRenaming = useCallback((entry: WorkspaceEntry) => {
    setRenamingEntryPath(entry.path)
  }, [])

  const cancelRenaming = useCallback(() => {
    setRenamingEntryPath(null)
  }, [])

  const handleRenameSubmit = useCallback(
    async (entry: WorkspaceEntry, nextName: string) => {
      try {
        await renameEntry(entry, nextName)
      } catch (error) {
        console.error('Failed to rename entry:', error)
      } finally {
        setRenamingEntryPath(null)
      }
    },
    [renameEntry]
  )

  useAutoCloseSidebars()

  useEnterToRename({
    containerRef: fileExplorerRef,
    selectionAnchorPath,
    renamingEntryPath,
    beginRenaming,
    entryMap,
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

  const { handleEntryContextMenu, handleRootContextMenu } =
    useFileExplorerMenus({
      renameConfig,
      renameNoteWithAI,
      setAiRenamingEntryPaths,
      beginRenaming,
      handleDeleteEntries,
      createNote,
      createFolder,
      openNote,
      setRenamingEntryPath,
      workspacePath,
      selectedEntryPaths,
      setSelectedEntryPaths,
      setSelectionAnchorPath,
      resetSelection,
      entries,
      pinnedDirectories,
      pinDirectory,
      unpinDirectory,
    })

  const handleEntryPrimaryAction = useCallback(
    (entry: WorkspaceEntry, event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      const path = entry.path
      const isMulti = event.metaKey || event.ctrlKey
      const isRange = event.shiftKey

      let nextSelection = new Set(selectedEntryPaths)

      if (isRange) {
        if (
          selectionAnchorPath &&
          entryOrderMap.has(selectionAnchorPath) &&
          entryOrderMap.has(path)
        ) {
          nextSelection = new Set()
          const anchorIndex = entryOrderMap.get(selectionAnchorPath)!
          const currentIndex = entryOrderMap.get(path)!
          const start = Math.min(anchorIndex, currentIndex)
          const end = Math.max(anchorIndex, currentIndex)
          for (let index = start; index <= end; index += 1) {
            const targetPath = visibleEntryPaths[index]
            if (targetPath) {
              nextSelection.add(targetPath)
            }
          }
        } else {
          nextSelection = new Set([path])
        }
      } else if (isMulti) {
        if (nextSelection.has(path)) {
          nextSelection.delete(path)
        } else {
          nextSelection.add(path)
        }
      } else {
        nextSelection = new Set([path])
      }

      setSelectedEntryPaths(nextSelection)

      let nextAnchor: string | null = selectionAnchorPath

      if (isRange) {
        if (
          selectionAnchorPath &&
          entryOrderMap.has(selectionAnchorPath) &&
          nextSelection.has(selectionAnchorPath)
        ) {
          nextAnchor = selectionAnchorPath
        } else {
          nextAnchor = path
        }
      } else if (isMulti) {
        if (nextSelection.has(path)) {
          nextAnchor = path
        } else if (
          selectionAnchorPath &&
          nextSelection.has(selectionAnchorPath)
        ) {
          nextAnchor = selectionAnchorPath
        } else {
          const firstSelected = nextSelection.values().next().value ?? null
          nextAnchor = firstSelected ?? null
        }
      } else if (!entry.isDirectory) {
        nextAnchor = path
      } else if (
        selectionAnchorPath &&
        nextSelection.has(selectionAnchorPath)
      ) {
        nextAnchor = selectionAnchorPath
      } else {
        const firstSelected = nextSelection.values().next().value ?? null
        nextAnchor = firstSelected ?? null
      }

      setSelectionAnchorPath(nextSelection.size > 0 ? nextAnchor : null)

      if (!isRange && !isMulti) {
        if (entry.isDirectory) {
          setCurrentCollectionPath((prev) =>
            prev === entry.path ? null : entry.path
          )
        } else if (entry.name.endsWith('.md')) {
          openNote(entry.path)
        } else if (
          isImageFile(entry.name.substring(entry.name.lastIndexOf('.')))
        ) {
          openImagePreview(entry.path)
        }
      }
    },
    [
      entryOrderMap,
      openNote,
      selectedEntryPaths,
      selectionAnchorPath,
      setSelectedEntryPaths,
      setSelectionAnchorPath,
      visibleEntryPaths,
      openImagePreview,
      setCurrentCollectionPath,
    ]
  )

  return (
    <>
      <TopMenu
        isOpen={isOpen}
        width={width}
        isResizing={isResizing}
        isFileExplorerOpen={isFileExplorerOpen}
        setFileExplorerOpen={setFileExplorerOpen}
      />
      <aside
        ref={fileExplorerRef}
        className={cn(
          'relative shrink-0 flex flex-col overflow-hidden',
          isResizing
            ? 'transition-none'
            : 'transition-[width] ease-out duration-100'
        )}
        style={{ width: isOpen ? width : 0 }}
      >
        <div
          className={cn(
            'flex items-center justify-between px-2 gap-1 overflow-hidden mt-12'
          )}
        >
          <div className="shrink-0 max-w-40">
            <WorkspaceDropdown
              workspacePath={workspacePath}
              recentWorkspacePaths={recentWorkspacePaths}
              onWorkspaceSelect={setWorkspace}
              onOpenFolderPicker={openFolderPicker}
            />
          </div>
          <GitSyncStatus workspacePath={workspacePath} />
        </div>
        <div
          ref={setWorkspaceDropRef}
          className={cn(
            'flex-1 overflow-y-auto p-2',
            isOverWorkspace &&
              'bg-blue-100/30 dark:bg-blue-900/30 ring-2 ring-inset ring-blue-400 dark:ring-blue-600'
          )}
          onContextMenu={handleRootContextMenu}
          onClick={() => {
            setSelectedEntryPaths(new Set())
          }}
        >
          <TagList />
          <PinnedList />
          <ul className="space-y-0.5 pb-4">
            {entries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                tab={tab}
                depth={0}
                expandedDirectories={expandedDirectories}
                onDirectoryClick={toggleDirectory}
                onEntryPrimaryAction={handleEntryPrimaryAction}
                onEntryContextMenu={handleEntryContextMenu}
                selectedEntryPaths={selectedEntryPaths}
                renamingEntryPath={renamingEntryPath}
                aiRenamingEntryPaths={aiRenamingEntryPaths}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={cancelRenaming}
              />
            ))}
          </ul>
        </div>
        <footer className={cn('p-2 flex flex-col')}>
          <SettingsMenu />
          <FeedbackButton />
        </footer>
        {isOpen && (
          <div
            className="absolute top-0 -right-1 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-foreground/20 transition-colors delay-100"
            onPointerDown={handlePointerDown}
          />
        )}
      </aside>
    </>
  )
}
