import { Menu, MenuItem } from '@tauri-apps/api/menu'
import {
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
  useCallback,
} from 'react'
import type { ChatConfig } from '@/store/ai-settings-store'
import type { WorkspaceEntry } from '@/store/workspace-store'

type UseFileExplorerMenusProps = {
  renameConfig: ChatConfig | null
  renameNoteWithAI: (entry: WorkspaceEntry) => Promise<void>
  setAiRenamingEntryPaths: Dispatch<SetStateAction<Set<string>>>
  beginRenaming: (entry: WorkspaceEntry) => void
  handleDeleteEntries: (paths: string[]) => Promise<void>
  createNote: (directoryPath: string) => Promise<string | null>
  createFolder: (directoryPath: string) => Promise<string | null>
  openNote: (path: string) => void
  setRenamingEntryPath: Dispatch<SetStateAction<string | null>>
  workspacePath: string | null
  selectedEntryPaths: Set<string>
  setSelectedEntryPaths: (paths: Set<string>) => void
  setSelectionAnchorPath: (path: string | null) => void
  resetSelection: () => void
  entries: WorkspaceEntry[]
  pinnedDirectories: string[]
  pinDirectory: (path: string) => Promise<void>
  unpinDirectory: (path: string) => Promise<void>
}

export const useFileExplorerMenus = ({
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
}: UseFileExplorerMenusProps) => {
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
    [
      beginRenaming,
      handleDeleteEntries,
      renameConfig,
      renameNoteWithAI,
      setAiRenamingEntryPaths,
    ]
  )

  const showDirectoryMenu = useCallback(
    async (directoryEntry: WorkspaceEntry, selectionPaths: string[]) => {
      const directoryPath = directoryEntry.path
      const isPinned = pinnedDirectories.includes(directoryPath)
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
          await MenuItem.new({
            id: `pin-directory-${directoryPath}`,
            text: isPinned ? 'Unpin' : 'Pin',
            action: async () => {
              if (isPinned) {
                await unpinDirectory(directoryPath)
              } else {
                await pinDirectory(directoryPath)
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
      beginRenaming,
      createFolder,
      createNote,
      handleDeleteEntries,
      openNote,
      setRenamingEntryPath,
      workspacePath,
      pinnedDirectories,
      pinDirectory,
      unpinDirectory,
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
    (event: MouseEvent<HTMLElement>) => {
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

  return {
    handleEntryContextMenu,
    handleRootContextMenu,
  }
}
