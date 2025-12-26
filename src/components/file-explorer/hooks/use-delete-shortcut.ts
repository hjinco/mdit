import { useEffect } from 'react'

import { isMac } from '@/utils/platform'

type UseDeleteShortcutOptions = {
  containerRef: React.RefObject<HTMLElement | null>
  selectedEntryPaths: Set<string>
  handleDeleteEntries: (paths: string[]) => Promise<void>
}

export function useDeleteShortcut({
  containerRef,
  selectedEntryPaths,
  handleDeleteEntries,
}: UseDeleteShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' || event.defaultPrevented || event.repeat) {
        return
      }

      // Check for Cmd (macOS) or Ctrl (Windows/Linux)
      const usesShortcutKey = isMac() ? event.metaKey : event.ctrlKey
      if (!usesShortcutKey) {
        return
      }

      // Don't trigger if other modifiers are pressed
      if (
        event.altKey ||
        event.shiftKey ||
        (isMac() ? event.ctrlKey : event.metaKey)
      ) {
        return
      }

      const target = event.target as HTMLElement | null
      if (!target) {
        return
      }

      // Only work when focus is within the file explorer container
      if (containerRef.current && !containerRef.current.contains(target)) {
        return
      }

      // Don't trigger when typing in input fields
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      // Only work when there are selected entries
      if (selectedEntryPaths.size === 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      handleDeleteEntries(Array.from(selectedEntryPaths))
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [containerRef, selectedEntryPaths, handleDeleteEntries])
}
