import { useEffect } from 'react'
import { useStore } from '@/store'

/**
 * Syncs the current font scale to the root CSS variable.
 */
export function useFontScale() {
  const fontScale = useStore((s) => s.fontScale)

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--font-scale',
      String(fontScale)
    )
  }, [fontScale])

  return fontScale
}
