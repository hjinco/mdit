import { useCallback, useEffect, useRef, useState } from 'react'

export function usePreviewCache(currentCollectionPath: string | null) {
  const [previewTexts, setPreviewTexts] = useState<Map<string, string>>(
    new Map()
  )
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    // Clear pending timeout if exists
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (currentCollectionPath === null) {
      // Delay cache clear when closing (to match transition delay)
      timeoutRef.current = window.setTimeout(() => {
        setPreviewTexts(new Map())
        timeoutRef.current = null
      }, 150)
    } else {
      // Clear cache immediately when collection path changes
      setPreviewTexts(new Map())
    }

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [currentCollectionPath])

  // Stable cache access functions
  const getPreview = useCallback(
    (path: string) => {
      return previewTexts.get(path)
    },
    [previewTexts]
  )

  const setPreview = useCallback((path: string, preview: string) => {
    setPreviewTexts((prev) => {
      const next = new Map(prev)
      next.set(path, preview)
      return next
    })
  }, [])

  return { getPreview, setPreview }
}
