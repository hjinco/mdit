import { useEffect } from 'react'
import {
  FONT_SCALE_STORAGE_KEY,
  useFontScaleStore,
} from '@/store/font-scale-store'

/**
 * Syncs the current font scale to the root CSS variable and local storage.
 */
export function useFontScale() {
  const fontScale = useFontScaleStore((s) => s.fontScale)

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--font-scale',
      String(fontScale)
    )
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, String(fontScale))
  }, [fontScale])

  return fontScale
}
