import { useEffect } from 'react'
import { useUIStore } from '@/store/ui-store'

/**
 * Syncs the current font scale to the root CSS variable.
 */
export function useFontScale() {
  const fontScale = useUIStore((s) => s.fontScale)

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--font-scale',
      String(fontScale)
    )
  }, [fontScale])

  return fontScale
}
