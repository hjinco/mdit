import { useEffect } from 'react'

// Registers ⌘/Ctrl + [ and ⌘/Ctrl + ] to navigate tab history.
export const useTabNavigationShortcuts = (
  canGoBack: boolean,
  canGoForward: boolean,
  goBack: () => void,
  goForward: () => void
) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }

      const usesShortcutKey = event.metaKey || event.ctrlKey
      if (!usesShortcutKey) {
        return
      }

      if (event.key === '{' && canGoBack) {
        event.preventDefault()
        goBack()
      } else if (event.key === '}' && canGoForward) {
        event.preventDefault()
        goForward()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [canGoBack, canGoForward, goBack, goForward])
}
