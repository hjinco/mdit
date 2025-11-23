import { Menu, MenuItem } from '@tauri-apps/api/menu'
import { useCallback, useState } from 'react'
import type { ChatConfig } from '@/store/ai-settings-store'
import type { WorkspaceEntry } from '@/store/workspace-store'

type UseCollectionContextMenuProps = {
  renameConfig: ChatConfig | null
  renameNoteWithAI: (entry: WorkspaceEntry) => Promise<void>
  beginRenaming: (entry: WorkspaceEntry) => void
  handleDeleteEntries: (paths: string[]) => Promise<void>
  selectedEntryPaths: Set<string>
  setSelectedEntryPaths: (paths: Set<string>) => void
  setSelectionAnchorPath: (path: string | null) => void
  resetSelection: () => void
}

export function useCollectionContextMenu({
  renameConfig,
  renameNoteWithAI,
  beginRenaming,
  handleDeleteEntries,
  selectedEntryPaths,
  setSelectedEntryPaths,
  setSelectionAnchorPath,
}: UseCollectionContextMenuProps) {
  const [aiRenamingEntryPaths, setAiRenamingEntryPaths] = useState<Set<string>>(
    () => new Set()
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
    [beginRenaming, handleDeleteEntries, renameConfig, renameNoteWithAI]
  )

  const handleEntryContextMenu = useCallback(
    async (entry: WorkspaceEntry) => {
      const isSelected = selectedEntryPaths.has(entry.path)
      let selectionTargets: string[]

      if (isSelected) {
        selectionTargets = Array.from(selectedEntryPaths)
      } else if (selectedEntryPaths.size === 1) {
        // Special case: if exactly one item is selected and user opens context menu
        // on a different entry, don't modify selection and only delete the context menu entry
        selectionTargets = [entry.path]
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

      await showEntryMenu(entry, selectionTargets)
    },
    [
      selectedEntryPaths,
      setSelectedEntryPaths,
      setSelectionAnchorPath,
      showEntryMenu,
    ]
  )

  return {
    handleEntryContextMenu,
    aiRenamingEntryPaths,
  }
}
