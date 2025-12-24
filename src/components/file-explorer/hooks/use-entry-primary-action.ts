import { type MouseEvent, useCallback } from 'react'
import type { WorkspaceEntry } from '@/store/workspace-store'
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
          openTab(entry.path)
        } else if (
          isImageFile(entry.name.substring(entry.name.lastIndexOf('.')))
        ) {
          openImagePreview(entry.path)
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
