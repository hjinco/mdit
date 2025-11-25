import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useState } from 'react'
import { isMac } from '@/utils/platform'

/**
 * Hook to detect if the window is currently in fullscreen mode.
 * Only works on macOS - returns false on other platforms.
 *
 * Listens to window resize events and checks fullscreen status with debouncing
 * to avoid excessive API calls during window resizing.
 *
 * @param debounceMs - Debounce delay in milliseconds (default: 150ms)
 * @returns boolean indicating if the window is in fullscreen mode
 *
 * @example
 * ```tsx
 * const isFullscreen = useIsFullscreen()
 * const leftOffset = isFullscreen ? 'left-2' : 'left-30'
 * ```
 */
export function useIsFullscreen(debounceMs = 600) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isMacOS = isMac()

  useEffect(() => {
    // Only check fullscreen on macOS
    if (!isMacOS) {
      setIsFullscreen(false)
      return
    }

    const currentWindow = getCurrentWindow()
    let debounceTimer: NodeJS.Timeout | null = null

    /**
     * Checks the current fullscreen status from Tauri window API
     */
    const checkFullscreen = async () => {
      try {
        const fullscreen = await currentWindow.isFullscreen()
        setIsFullscreen(fullscreen)
      } catch (error) {
        console.error('Failed to check fullscreen status:', error)
      }
    }

    /**
     * Debounced resize handler to avoid excessive API calls
     */
    const handleResize = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        checkFullscreen()
      }, debounceMs)
    }

    // Check initial fullscreen status immediately
    checkFullscreen()

    // Listen to window resize events
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
  }, [isMacOS, debounceMs])

  return isFullscreen
}
