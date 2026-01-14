import { type MouseEvent, useCallback } from 'react'
import { revealInFileManager } from '@/components/file-explorer/utils/file-manager'
import type { WorkspaceEntry } from '@/store/workspace/workspace-slice'
import { isImageFile } from '@/utils/file-icon'

type UseEntryPrimaryActionParams = {
  entryOrderMap: Map<string, number>
  openTab: (path: string) => void
  selectedEntryPaths: Set<string>
  selectionAnchorPath: string | null
  setSelectedEntryPaths: (nextSelection: Set<string>) => void
  setSelectionAnchorPath: (nextAnchor: string | null) => void
  visibleEntryPaths: string[]
  openImagePreview: (path: string) => void
  toggleDirectory: (path: string) => void
}

export const useEntryPrimaryAction = ({
  entryOrderMap,
  openTab,
  selectedEntryPaths,
  selectionAnchorPath,
  setSelectedEntryPaths,
  setSelectionAnchorPath,
  visibleEntryPaths,
  openImagePreview,
  toggleDirectory,
}: UseEntryPrimaryActionParams) => {
  return useCallback(
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
        // For range selection, if the original anchor is no longer valid,
        // the newly clicked item becomes the anchor. Otherwise, it's preserved.
        if (
          !selectionAnchorPath ||
          !entryOrderMap.has(selectionAnchorPath) ||
          !nextSelection.has(selectionAnchorPath)
        ) {
          nextAnchor = path
        }
      } else if (isMulti) {
        if (nextSelection.has(path)) {
          // When adding an item with multi-select, it becomes the new anchor.
          nextAnchor = path
        } else if (
          !selectionAnchorPath ||
          !nextSelection.has(selectionAnchorPath)
        ) {
          // When removing an item, if the anchor is removed, pick the first
          // available selected item as the new anchor.
          nextAnchor = nextSelection.values().next().value ?? null
        }
      } else {
        // For a single click, the clicked item always becomes the new anchor.
        nextAnchor = path
      }

      setSelectionAnchorPath(nextSelection.size > 0 ? nextAnchor : null)

      if (!isRange && !isMulti) {
        if (entry.isDirectory) {
          toggleDirectory(entry.path)
        } else if (entry.name.endsWith('.md')) {
          openTab(entry.path)
        } else if (isImageFile(entry.name)) {
          openImagePreview(entry.path)
        } else {
          revealInFileManager(entry.path, entry.isDirectory)
        }
      }
    },
    [
      entryOrderMap,
      openTab,
      selectedEntryPaths,
      selectionAnchorPath,
      setSelectedEntryPaths,
      setSelectionAnchorPath,
      visibleEntryPaths,
      openImagePreview,
      toggleDirectory,
    ]
  )
}
