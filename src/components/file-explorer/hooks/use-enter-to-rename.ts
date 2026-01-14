import { useEffect } from 'react'

import type { WorkspaceEntry } from '@/store/workspace/workspace-slice'

type UseEnterToRenameOptions = {
  containerRef: React.RefObject<HTMLElement | null>
  selectionAnchorPath: string | null
  renamingEntryPath: string | null
  beginRenaming: (entry: WorkspaceEntry) => void
  entryMap: Map<string, WorkspaceEntry>
}

export function useEnterToRename({
  containerRef,
  selectionAnchorPath,
  renamingEntryPath,
  beginRenaming,
  entryMap,
}: UseEnterToRenameOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return
      }

      const target = event.target as HTMLElement | null
      if (!target) {
        return
      }

      if (containerRef.current && !containerRef.current.contains(target)) {
        return
      }

      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      if (!selectionAnchorPath || renamingEntryPath) {
        return
      }

      const entry = entryMap.get(selectionAnchorPath)
      if (!entry) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      beginRenaming(entry)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [
    beginRenaming,
    containerRef,
    entryMap,
    renamingEntryPath,
    selectionAnchorPath,
  ])
}
