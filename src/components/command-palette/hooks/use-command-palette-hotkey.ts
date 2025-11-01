import { useCallback, useEffect } from 'react'

// Registers ⌘/Ctrl + P to toggle the command palette while keeping the latest open state in sync.
export const useCommandPaletteHotkey = (
  isOpen: boolean,
  openPalette: () => void,
  closePalette: () => void
) => {
  const togglePalette = useCallback(() => {
    if (isOpen) {
      closePalette()
    } else {
      openPalette()
    }
  }, [closePalette, isOpen, openPalette])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }

      const usesShortcutKey = event.metaKey || event.ctrlKey
      if (!usesShortcutKey || event.key.toLowerCase() !== 'p') {
        return
      }

      event.preventDefault()
      togglePalette()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [togglePalette])
}
