import { useEffect, useRef } from 'react'

/**
 * Hook to invalidate preview cache when a file is saved.
 *
 * This hook tracks the previous tab path to ensure that preview invalidation
 * only occurs when the same file is saved, not when switching between different files.
 *
 * @param tabPath - The current tab's file path (can be null/undefined)
 * @param isSaved - Whether the current tab's file has been saved
 * @param invalidatePreview - Function to invalidate the preview cache for a given path
 */
export function usePreviewInvalidation(
  tabPath: string | null | undefined,
  isSaved: boolean,
  invalidatePreview: (path: string) => void
) {
  // Ref to track the previous tab path
  // Used to detect when tab.path changes vs when the same file is saved
  const prevTabPathRef = useRef<string | null>(null)

  useEffect(() => {
    const currentTabPath = tabPath ?? null

    // If tab.path has changed, update the ref and return early
    // We don't invalidate preview when just switching between files
    if (prevTabPathRef.current !== currentTabPath) {
      prevTabPathRef.current = currentTabPath
      return
    }

    // Only invalidate preview if:
    // 1. The tab path hasn't changed (same file)
    // 2. The file has been saved (isSaved is true)
    // This ensures we only refresh the preview when the same file is edited and saved
    if (isSaved && currentTabPath) {
      invalidatePreview(currentTabPath)
    }
  }, [isSaved, tabPath, invalidatePreview])
}
