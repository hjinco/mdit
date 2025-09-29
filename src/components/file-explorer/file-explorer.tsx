import { Menu, MenuItem } from '@tauri-apps/api/menu'
import { useCallback, useState } from 'react'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'
import { TreeNode } from './ui/tree-node'

export function FileExplorer() {
  const {
    workspacePath,
    entries,
    expandedDirectories,
    createNote,
    createFolder,
    deleteEntry,
    renameEntry,
    toggleDirectory,
  } = useWorkspaceStore()
  const openNote = useTabStore((state) => state.openNote)

  const [renamingEntryPath, setRenamingEntryPath] = useState<string | null>(
    null
  )

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

  const showEntryMenu = useCallback(
    async (entry: WorkspaceEntry) => {
      try {
        const menu = await Menu.new({
          items: [
            await MenuItem.new({
              id: `rename-${entry.path}`,
              text: 'Rename',
              action: async () => {
                beginRenaming(entry)
              },
            }),
            await MenuItem.new({
              id: `delete-${entry.path}`,
              text: 'Delete',
              action: async () => {
                await deleteEntry(entry.path)
              },
            }),
          ],
        })

        await menu.popup()
      } catch (error) {
        console.error('Failed to open context menu:', error)
      }
    },
    [beginRenaming, deleteEntry]
  )

  const showDirectoryMenu = useCallback(
    async (directoryEntry: WorkspaceEntry) => {
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
              await createFolder(directoryPath)
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
                await deleteEntry(directoryPath)
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
      deleteEntry,
      openNote,
      beginRenaming,
      workspacePath,
    ]
  )

  const handleRootContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!workspacePath) return

      event.preventDefault()
      event.stopPropagation()

      showDirectoryMenu({
        path: workspacePath,
        name: workspacePath.split('/').pop() ?? 'Workspace',
        isDirectory: true,
        children: entries,
      })
    },
    [entries, showDirectoryMenu, workspacePath]
  )

  return (
    <aside
      className="shrink-0 w-64 flex flex-col bg-muted"
      onContextMenu={handleRootContextMenu}
    >
      <header className="flex items-center justify-between px-4 pt-2">
        <span className="text-foreground/70 cursor-default">
          {workspacePath?.split('/').pop()}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto px-1 py-2">
        <ul>
          {entries.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              expandedDirectories={expandedDirectories}
              onDirectoryClick={toggleDirectory}
              onDirectoryContextMenu={showDirectoryMenu}
              onFileContextMenu={showEntryMenu}
              renamingEntryPath={renamingEntryPath}
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={cancelRenaming}
            />
          ))}
        </ul>
      </div>
    </aside>
  )
}
