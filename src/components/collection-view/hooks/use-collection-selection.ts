import { type MouseEvent, useCallback, useState } from 'react'
import { useUIStore } from '@/store/ui-store'
import type { WorkspaceEntry } from '@/store/workspace-store'
import { isImageFile } from '@/utils/file-icon'

type Props = {
  entryOrderMap?: Map<string, number>
  sortedEntries?: WorkspaceEntry[]
  openNote?: (path: string) => void
}

export function useCollectionSelection({
  entryOrderMap,
  sortedEntries,
  openNote,
}: Props = {}) {
  const openImagePreview = useUIStore((state) => state.openImagePreview)
  const [selectedEntryPaths, setSelectedEntryPaths] = useState<Set<string>>(
    () => new Set()
  )
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(
    null
  )

  const resetSelection = useCallback(() => {
    setSelectedEntryPaths(new Set())
    setSelectionAnchorPath(null)
  }, [])

  const handleEntryPrimaryAction = useCallback(
    (entry: WorkspaceEntry, event: MouseEvent<HTMLLIElement>) => {
      if (!entryOrderMap || !sortedEntries || !openNote) {
        return
      }

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
            const targetPath = sortedEntries[index]?.path
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
      } else {
        nextAnchor = path
      }

      setSelectionAnchorPath(nextSelection.size > 0 ? nextAnchor : null)

      if (!isRange && !isMulti) {
        if (entry.name.endsWith('.md')) {
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
      openImagePreview,
      selectedEntryPaths,
      selectionAnchorPath,
      sortedEntries,
    ]
  )

  return {
    selectedEntryPaths,
    selectionAnchorPath,
    setSelectedEntryPaths,
    setSelectionAnchorPath,
    resetSelection,
    handleEntryPrimaryAction,
  }
}
