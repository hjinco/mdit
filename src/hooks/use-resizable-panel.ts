import type React from 'react'
import { useCallback, useEffect, useState } from 'react'

const DEFAULT_MIN_WIDTH = 120
const DEFAULT_MAX_WIDTH = 480
const DEFAULT_WIDTH = 256

const getStoredWidth = (storageKey: string) => {
  if (typeof window === 'undefined') return null

  try {
    const storedWidth = window.localStorage.getItem(storageKey)
    if (!storedWidth) return null

    const parsedWidth = Number.parseInt(storedWidth, 10)
    if (Number.isNaN(parsedWidth)) {
      window.localStorage.removeItem(storageKey)
      return null
    }

    return parsedWidth
  } catch (error) {
    console.error(`Failed to read width from storage (${storageKey})`, error)
    return null
  }
}

const persistWidth = (storageKey: string, width: number) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(storageKey, width.toString())
  } catch (error) {
    console.error(`Failed to persist width (${storageKey})`, error)
  }
}

type UseResizablePanelOptions = {
  storageKey: string
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

export const useResizablePanel = (options: UseResizablePanelOptions) => {
  const {
    storageKey,
    defaultWidth = DEFAULT_WIDTH,
    minWidth = DEFAULT_MIN_WIDTH,
    maxWidth = DEFAULT_MAX_WIDTH,
    isOpen,
    setIsOpen,
  } = options

  const [width, setWidth] = useState(
    () => getStoredWidth(storageKey) ?? defaultWidth
  )
  const [isResizing, setResizing] = useState(false)

  useEffect(() => {
    persistWidth(storageKey, width)
  }, [storageKey, width])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!isOpen) return

      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = width
      const previousUserSelect = document.body.style.userSelect
      let finalWidth = width

      setResizing(true)

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const delta = pointerEvent.clientX - startX
        const rawWidth = startWidth + delta
        const nextWidth = Math.max(minWidth, Math.min(maxWidth, rawWidth))
        finalWidth = rawWidth
        setWidth(nextWidth)
      }

      const handlePointerUp = () => {
        setResizing(false)
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerUp)

        if (finalWidth < minWidth) {
          setIsOpen(false)
        }
      }

      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerUp)
    },
    [isOpen, width, minWidth, maxWidth, setIsOpen]
  )

  return {
    isOpen,
    width,
    isResizing,
    handlePointerDown,
  }
}
