import { useEffect, useState } from 'react'
import { isWindows10 } from '@/utils/platform'

/**
 * Hook to detect if the current platform is Windows 10 or below (Windows 7, 8, 8.1, 10).
 * Returns false initially and updates asynchronously after checking.
 *
 * @returns true if Windows 10 or below, false otherwise
 */
export function useWindows10(): boolean {
  const [isWin10, setIsWin10] = useState(false)

  useEffect(() => {
    let isMounted = true

    const checkWindows10 = async () => {
      try {
        const result = await isWindows10()
        if (isMounted) {
          setIsWin10(result)
        }
      } catch (error) {
        console.error('Failed to check Windows 10:', error)
        if (isMounted) {
          setIsWin10(false)
        }
      }
    }

    checkWindows10()

    return () => {
      isMounted = false
    }
  }, [])

  return isWin10
}
