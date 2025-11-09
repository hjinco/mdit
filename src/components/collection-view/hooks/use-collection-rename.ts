import { useCallback, useState } from 'react'
import type { WorkspaceEntry } from '@/store/workspace-store'

type RenameEntry = (
  entry: WorkspaceEntry,
  newName: string
) => Promise<string | null>

type UseCollectionRenameProps = {
  renameEntry: RenameEntry
}

export function useCollectionRename({ renameEntry }: UseCollectionRenameProps) {
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
    async (entry: WorkspaceEntry, newName: string) => {
      try {
        await renameEntry(entry, newName)
      } catch (error) {
        console.error('Failed to rename entry:', error)
      } finally {
        setRenamingEntryPath(null)
      }
    },
    [renameEntry]
  )

  return {
    renamingEntryPath,
    beginRenaming,
    cancelRenaming,
    handleRenameSubmit,
  }
}
