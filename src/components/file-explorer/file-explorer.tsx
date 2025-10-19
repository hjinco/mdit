import { useDroppable } from '@dnd-kit/core'
import { Menu, MenuItem } from '@tauri-apps/api/menu'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink } from 'lucide-react'
import { useCallback, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAISettingsStore } from '@/store/ai-settings-store'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { SettingsMenu } from './ui/settings-menu'
import { TreeNode } from './ui/tree-node'
import { WorkspaceDropdown } from './ui/workspace-dropdown'

export function FileExplorer() {
  const isOpen = useUIStore((state) => state.isFileExplorerOpen)
  // const { licenseStatus, openLicenseDialog } = useLicenseStore()
  const {
    workspacePath,
    entries,
    expandedDirectories,
    recentWorkspacePaths,
    createNote,
    createFolder,
    deleteEntry,
    renameNoteWithAI,
    renameEntry,
    toggleDirectory,
    setWorkspace,
    openFolderPicker,
  } = useWorkspaceStore()
  const openNote = useTabStore((state) => state.openNote)
  const chatConfig = useAISettingsStore((state) => state.chatConfig)

  const [renamingEntryPath, setRenamingEntryPath] = useState<string | null>(
    null
  )
  const [aiRenamingEntryPaths, setAiRenamingEntryPaths] = useState<Set<string>>(
    () => new Set()
  )

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

  const showEntryMenu = useCallback(
    async (entry: WorkspaceEntry) => {
      try {
        const itemPromises: Promise<MenuItem>[] = []

        if (entry.name.toLowerCase().endsWith('.md')) {
          itemPromises.push(
            MenuItem.new({
              id: `rename-ai-${entry.path}`,
              text: 'Rename with AI',
              enabled: Boolean(chatConfig),
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
              await deleteEntry(entry.path)
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
    [beginRenaming, deleteEntry, renameNoteWithAI, chatConfig]
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
        'shrink-0 w-64 flex flex-col bg-muted transition-[width] duration-200 border-r',
        !isOpen && 'w-0 overflow-hidden border-none'
      )}
    >
      <header className="flex items-center justify-between px-1 pt-2">
        <WorkspaceDropdown
          workspacePath={workspacePath}
          recentWorkspacePaths={recentWorkspacePaths}
          onWorkspaceSelect={setWorkspace}
          onOpenFolderPicker={openFolderPicker}
        />
      </header>
      <div
        ref={setWorkspaceDropRef}
        className={cn(
          'flex-1 overflow-y-auto p-1',
          isOverWorkspace &&
            'bg-blue-100/30 dark:bg-blue-900/30 ring-2 ring-inset ring-blue-400 dark:ring-blue-600'
        )}
        onContextMenu={handleRootContextMenu}
      >
        <ul className="space-y-0.5 min-h-full pb-4">
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
              aiRenamingEntryPaths={aiRenamingEntryPaths}
              onRenameSubmit={handleRenameSubmit}
              onRenameCancel={cancelRenaming}
            />
          ))}
        </ul>
      </div>
      <footer className="px-2 pb-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={handleFeatureBaseClick}
        >
          <ExternalLink /> Feedback
        </Button>
        {/* {!licenseStatus.hasLicense && (
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={openLicenseDialog}
          >
            <KeyRoundIcon />
            {getLicenseButtonText()}
          </Button>
        )} */}
        <SettingsMenu />
      </footer>
    </aside>
  )
}
