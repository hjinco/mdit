import type React from 'react'
import { useCallback } from 'react'
import { useUIStore } from '@/store/ui-store'

const DEFAULT_MIN_WIDTH = 200
const DEFAULT_MAX_WIDTH = 480

type UseFileExplorerResizeOptions = {
  minWidth?: number
  maxWidth?: number
}

export const useFileExplorerResize = (
  options?: UseFileExplorerResizeOptions
) => {
  const isOpen = useUIStore((state) => state.isFileExplorerOpen)
  const width = useUIStore((state) => state.fileExplorerWidth)
  const setWidth = useUIStore((state) => state.setFileExplorerWidth)
  const isResizing = useUIStore((state) => state.isFileExplorerResizing)
  const setResizing = useUIStore((state) => state.setFileExplorerResizing)

  const minWidth = options?.minWidth ?? DEFAULT_MIN_WIDTH
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_WIDTH

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!isOpen) return

      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = width
      const previousUserSelect = document.body.style.userSelect

      setResizing(true)

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const delta = pointerEvent.clientX - startX
        const nextWidth = Math.max(
          minWidth,
          Math.min(maxWidth, startWidth + delta)
        )
        setWidth(nextWidth)
      }

      const handlePointerUp = () => {
        setResizing(false)
        document.body.style.userSelect = previousUserSelect
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerUp)
      }

      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerUp)
    },
    [isOpen, width, minWidth, maxWidth, setWidth, setResizing]
  )

  return {
    isOpen,
    width,
    isResizing,
    handlePointerDown,
  }
}
