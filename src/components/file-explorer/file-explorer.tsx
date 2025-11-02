import { useDroppable } from '@dnd-kit/core'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import { useFileExplorerResize } from '@/hooks/use-file-explorer-resize'
import { cn } from '@/lib/utils'
import { useAISettingsStore } from '@/store/ai-settings-store'
import { useFileExplorerSelectionStore } from '@/store/file-explorer-selection-store'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'
import { TooltipProvider } from '@/ui/tooltip'
import { useFileExplorerMenus } from './hooks/use-context-menus'
import { useEnterToRename } from './hooks/use-enter-to-rename'
import { useEntryMap } from './hooks/use-entry-map'
import { useExpandActiveTab } from './hooks/use-expand-active-tab'
import { useFileExplorerScroll } from './hooks/use-workspace-scroll'
import { FeedbackButton } from './ui/feedback-button'
import { SettingsMenu } from './ui/settings-menu'
import { TreeNode } from './ui/tree-node'
import { WorkspaceDropdown } from './ui/workspace-dropdown'

export function FileExplorer() {
  const fileExplorerRef = useRef<HTMLElement | null>(null)
  const { isOpen, width, isResizing, handlePointerDown } =
    useFileExplorerResize()
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
  } = useWorkspaceStore()
  const { tab, openNote } = useTabStore(
    useShallow((s) => ({ tab: s.tab, openNote: s.openNote }))
  )
  const renameConfig = useAISettingsStore((state) => state.renameConfig)

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

  const {
    hasWorkspaceScroll,
    isWorkspaceScrollAtBottom,
    isWorkspaceScrollAtTop,
    handleWorkspaceScroll,
    handleWorkspaceContainerRef,
  } = useFileExplorerScroll({
    entries,
    expandedDirectories,
    setWorkspaceDropRef,
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

  useEnterToRename({
    containerRef: fileExplorerRef,
    selectionAnchorPath,
    renamingEntryPath,
    beginRenaming,
    entryMap,
  })

  useExpandActiveTab(entries, tab)

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

  const { showEntryMenu, showDirectoryMenu } = useFileExplorerMenus({
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
  })

  const handleEntryPrimaryAction = useCallback(
    (entry: WorkspaceEntry, event: React.MouseEvent<HTMLButtonElement>) => {
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
          toggleDirectory(entry.path)
        } else if (entry.name.endsWith('.md')) {
          openNote(entry.path)
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
      toggleDirectory,
      visibleEntryPaths,
    ]
  )

  const handleEntryContextMenu = useCallback(
    async (entry: WorkspaceEntry) => {
      const isSelected = selectedEntryPaths.has(entry.path)
      let selectionTargets: string[]

      if (isSelected) {
        selectionTargets = Array.from(selectedEntryPaths)
      } else {
        const nextSelection = new Set(selectedEntryPaths)
        const hadSelection = nextSelection.size > 0
        nextSelection.add(entry.path)
        selectionTargets = Array.from(nextSelection)
        setSelectedEntryPaths(nextSelection)
        if (!hadSelection) {
          setSelectionAnchorPath(entry.path)
        }
      }

      if (entry.isDirectory) {
        await showDirectoryMenu(entry, selectionTargets)
      } else {
        await showEntryMenu(entry, selectionTargets)
      }
    },
    [
      selectedEntryPaths,
      setSelectedEntryPaths,
      setSelectionAnchorPath,
      showDirectoryMenu,
      showEntryMenu,
    ]
  )

  const handleRootContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!workspacePath) return

      event.preventDefault()
      event.stopPropagation()

      resetSelection()

      showDirectoryMenu(
        {
          path: workspacePath,
          name: workspacePath.split('/').pop() ?? 'Workspace',
          isDirectory: true,
          children: entries,
        },
        []
      )
    },
    [entries, resetSelection, showDirectoryMenu, workspacePath]
  )

  return (
    <aside
      ref={fileExplorerRef}
      className={cn(
        'font-scale-scope relative shrink-0 flex flex-col mt-10',
        !isResizing && 'transition-[width] duration-200',
        isResizing && 'transition-none',
        !isOpen && 'overflow-hidden border-none'
      )}
      style={{ width: isOpen ? width : 0 }}
    >
      <header
        className={cn(
          'flex items-center justify-between pl-1 pr-2 py-1',
          hasWorkspaceScroll &&
            !isWorkspaceScrollAtTop &&
            'border-b border-border/20'
        )}
      >
        <WorkspaceDropdown
          workspacePath={workspacePath}
          recentWorkspacePaths={recentWorkspacePaths}
          onWorkspaceSelect={setWorkspace}
          onOpenFolderPicker={openFolderPicker}
        />
      </header>
      <div
        ref={handleWorkspaceContainerRef}
        className={cn(
          'flex-1 overflow-y-auto pl-1 pr-2 py-1',
          isOverWorkspace &&
            'bg-blue-100/30 dark:bg-blue-900/30 ring-2 ring-inset ring-blue-400 dark:ring-blue-600'
        )}
        onContextMenu={handleRootContextMenu}
        onClick={() => {
          setSelectedEntryPaths(new Set())
        }}
        onScroll={handleWorkspaceScroll}
      >
        <ul className="space-y-0.5 min-h-full pb-4">
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
      <footer
        className={cn(
          'pl-1 pr-2 py-1 flex transition-[border]',
          hasWorkspaceScroll &&
            !isWorkspaceScrollAtBottom &&
            'border-t border-border/20'
        )}
      >
        <TooltipProvider delayDuration={500} skipDelayDuration={0}>
          <SettingsMenu />
          <FeedbackButton />
        </TooltipProvider>
      </footer>
      {isOpen && (
        <div
          className="absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-border/50"
          onPointerDown={handlePointerDown}
        />
      )}
    </aside>
  )
}
