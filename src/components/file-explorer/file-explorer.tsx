import { useDroppable } from '@dnd-kit/core'
import { Menu, MenuItem } from '@tauri-apps/api/menu'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import { useFileExplorerResize } from '@/hooks/use-file-explorer-resize'
import { cn } from '@/lib/utils'
import { useAISettingsStore } from '@/store/ai-settings-store'
import { useFileExplorerSelectionStore } from '@/store/file-explorer-selection-store'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { SettingsMenu } from './ui/settings-menu'
import { TreeNode } from './ui/tree-node'
import { WorkspaceDropdown } from './ui/workspace-dropdown'

export function FileExplorer() {
  const { isOpen, width, isResizing, handlePointerDown } =
    useFileExplorerResize()
  // const { licenseStatus, openLicenseDialog } = useLicenseStore()
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
  const openNote = useTabStore((s) => s.openNote)
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [hasWorkspaceScroll, setHasWorkspaceScroll] = useState(false)
  const [isWorkspaceScrollAtBottom, setIsWorkspaceScrollAtBottom] =
    useState(true)
  const [isWorkspaceScrollAtTop, setIsWorkspaceScrollAtTop] = useState(true)

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

  const updateWorkspaceScrollState = useCallback(() => {
    const element = scrollContainerRef.current

    if (!element) {
      setHasWorkspaceScroll(false)
      setIsWorkspaceScrollAtBottom(true)
      setIsWorkspaceScrollAtTop(true)
      return
    }

    const hasOverflow = element.scrollHeight - element.clientHeight > 1
    setHasWorkspaceScroll(hasOverflow)

    if (!hasOverflow) {
      setIsWorkspaceScrollAtBottom(true)
      setIsWorkspaceScrollAtTop(true)
      return
    }

    const isAtBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <= 1
    const isAtTop = element.scrollTop <= 1
    setIsWorkspaceScrollAtBottom(isAtBottom)
    setIsWorkspaceScrollAtTop(isAtTop)
  }, [])

  const handleWorkspaceScroll = useCallback(() => {
    const element = scrollContainerRef.current
    if (!element) return

    const isAtBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <= 1
    const isAtTop = element.scrollTop <= 1

    setIsWorkspaceScrollAtBottom((prev) =>
      prev === isAtBottom ? prev : isAtBottom
    )
    setIsWorkspaceScrollAtTop((prev) => (prev === isAtTop ? prev : isAtTop))
  }, [])

  const handleWorkspaceContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      scrollContainerRef.current = node
      setWorkspaceDropRef(node)

      if (!node) {
        setHasWorkspaceScroll(false)
        setIsWorkspaceScrollAtBottom(true)
        setIsWorkspaceScrollAtTop(true)
        return
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserverRef.current = new ResizeObserver(() => {
          updateWorkspaceScrollState()
        })
        resizeObserverRef.current.observe(node)
      }

      updateWorkspaceScrollState()
    },
    [setWorkspaceDropRef, updateWorkspaceScrollState]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: true
  useEffect(() => {
    updateWorkspaceScrollState()
  }, [entries, expandedDirectories, updateWorkspaceScrollState])

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

  const showEntryMenu = useCallback(
    async (entry: WorkspaceEntry, selectionPaths: string[]) => {
      try {
        const itemPromises: Promise<MenuItem>[] = []

        if (entry.name.toLowerCase().endsWith('.md')) {
          itemPromises.push(
            MenuItem.new({
              id: `rename-ai-${entry.path}`,
              text: 'Rename with AI',
              enabled: Boolean(renameConfig),
              action: async () => {
                setAiRenamingEntryPaths((paths) => {
                  const next = new Set(paths)
                  next.add(entry.path)
                  return next
                })
                try {
                  await renameNoteWithAI(entry)
                } catch (error) {
                  console.error('Failed to rename entry with AI:', error)
                } finally {
                  setAiRenamingEntryPaths((paths) => {
                    if (!paths.has(entry.path)) {
                      return paths
                    }
                    const next = new Set(paths)
                    next.delete(entry.path)
                    return next
                  })
                }
              },
            })
          )
        }

        itemPromises.push(
          MenuItem.new({
            id: `rename-${entry.path}`,
            text: 'Rename',
            action: async () => {
              beginRenaming(entry)
            },
          })
        )

        itemPromises.push(
          MenuItem.new({
            id: `delete-${entry.path}`,
            text: 'Delete',
            action: async () => {
              const targets =
                selectionPaths.length > 0 ? selectionPaths : [entry.path]
              await handleDeleteEntries(targets)
            },
          })
        )

        const items = await Promise.all(itemPromises)

        const menu = await Menu.new({
          items,
        })

        await menu.popup()
      } catch (error) {
        console.error('Failed to open context menu:', error)
      }
    },
    [beginRenaming, handleDeleteEntries, renameNoteWithAI, renameConfig]
  )

  const showDirectoryMenu = useCallback(
    async (directoryEntry: WorkspaceEntry, selectionPaths: string[]) => {
      const directoryPath = directoryEntry.path
      try {
        const items = [
          await MenuItem.new({
            id: `new-note-${directoryPath}`,
            text: 'New Note',
            action: async () => {
              const filePath = await createNote(directoryPath)
              if (filePath) {
                openNote(filePath)
              }
            },
          }),
          await MenuItem.new({
            id: `new-folder-${directoryPath}`,
            text: 'New Folder',
            action: async () => {
              const newFolderPath = await createFolder(directoryPath)
              if (newFolderPath) {
                setRenamingEntryPath(newFolderPath)
              }
            },
          }),
        ]

        if (!workspacePath || directoryPath !== workspacePath) {
          items.push(
            await MenuItem.new({
              id: `rename-directory-${directoryPath}`,
              text: 'Rename',
              action: async () => {
                beginRenaming(directoryEntry)
              },
            })
          )
        }

        if (workspacePath && directoryPath !== workspacePath) {
          items.push(
            await MenuItem.new({
              id: `delete-directory-${directoryPath}`,
              text: 'Delete',
              action: async () => {
                const targets =
                  selectionPaths.length > 0 ? selectionPaths : [directoryPath]
                await handleDeleteEntries(targets)
              },
            })
          )
        }

        const menu = await Menu.new({
          items,
        })

        await menu.popup()
      } catch (error) {
        console.error('Failed to open context menu:', error)
      }
    },
    [
      createNote,
      createFolder,
      openNote,
      beginRenaming,
      workspacePath,
      handleDeleteEntries,
    ]
  )

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

  // const getLicenseButtonText = () => {
  //   if (licenseStatus.isInTrial) {
  //     return `Trial: ${licenseStatus.daysRemaining}d left`
  //   }
  //   return 'Activate License'
  // }

  const handleFeatureBaseClick = useCallback(async () => {
    try {
      await openUrl('https://mdit.featurebase.app')
    } catch (error) {
      console.error('Failed to open FeatureBase URL:', error)
    }
  }, [])

  return (
    <aside
      className={cn(
        'font-scale-scope relative shrink-0 flex flex-col bg-muted border-r',
        !isResizing && 'transition-[width] duration-200',
        isResizing && 'transition-none',
        !isOpen && 'overflow-hidden border-none'
      )}
      style={{ width: isOpen ? width : 0 }}
    >
      <header
        className={cn(
          'flex items-center justify-between px-2 py-1',
          hasWorkspaceScroll && !isWorkspaceScrollAtTop && 'border-b'
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
          'flex-1 overflow-y-auto px-2 py-1',
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
          'px-2 py-2 space-y-0.5 transition-[border]',
          hasWorkspaceScroll && !isWorkspaceScrollAtBottom && 'border-t'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:bg-stone-200/80 dark:hover:bg-stone-700/80"
          onClick={handleFeatureBaseClick}
        >
          <ExternalLink /> Feedback
        </Button>
        <SettingsMenu />
      </footer>
      {isOpen && (
        <div
          className="absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-border"
          onPointerDown={handlePointerDown}
        />
      )}
    </aside>
  )
}
