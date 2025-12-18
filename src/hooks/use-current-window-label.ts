import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useState } from 'react'

/**
 * Hook to get the current window label.
 * Returns null initially until the window label is fetched.
 *
 * @returns The current window label string, or null if not yet loaded
 *
 * @example
 * ```tsx
 * const windowLabel = useCurrentWindowLabel()
 * if (windowLabel.startsWith('quick-note')) {
 *   return <QuickNote />
 * }
 * ```
 */
export function useCurrentWindowLabel(): string | null {
  const [windowLabel, setWindowLabel] = useState<string | null>(null)

  useEffect(() => {
    const currentWindow = getCurrentWindow()
    setWindowLabel(currentWindow.label)
  }, [])

  return windowLabel
}
