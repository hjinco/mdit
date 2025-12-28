import { invoke } from '@tauri-apps/api/core'
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
      }, 100)
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

  const setPreview = useCallback(async (path: string) => {
    try {
      const preview = await invoke<string>('get_note_preview', {
        path,
      })
      setPreviewTexts((prev) => {
        const next = new Map(prev)
        next.set(path, preview)
        return next
      })
    } catch (_e) {
      setPreviewTexts((prev) => {
        const next = new Map(prev)
        next.set(path, '')
        return next
      })
    }
  }, [])

  const invalidatePreview = useCallback(async (path: string) => {
    try {
      const preview = await invoke<string>('get_note_preview', {
        path,
      })
      setPreviewTexts((prev) => {
        if (!prev.has(path)) {
          return prev
        }
        const next = new Map(prev)
        next.set(path, preview)
        return next
      })
    } catch (_e) {
      console.error('Failed to invalidate preview:', _e)
    }
  }, [])

  return { getPreview, setPreview, invalidatePreview }
}
