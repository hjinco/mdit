import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceEntry } from '@/store/workspace-store'

type UseFileExplorerScrollProps = {
  entries: WorkspaceEntry[]
  expandedDirectories: Record<string, boolean>
  setWorkspaceDropRef: (node: HTMLElement | null) => void
}

export const useFileExplorerScroll = ({
  entries,
  expandedDirectories,
  setWorkspaceDropRef,
}: UseFileExplorerScrollProps) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [hasWorkspaceScroll, setHasWorkspaceScroll] = useState(false)
  const [isWorkspaceScrollAtBottom, setIsWorkspaceScrollAtBottom] =
    useState(true)
  const [isWorkspaceScrollAtTop, setIsWorkspaceScrollAtTop] = useState(true)

  const updateWorkspaceScrollState = useCallback(() => {
    const element = scrollContainerRef.current

    if (!element) {
      setHasWorkspaceScroll(false)
      setIsWorkspaceScrollAtBottom(true)
      setIsWorkspaceScrollAtTop(true)
      return
    }

    const hasOverflow = element.scrollHeight - element.clientHeight > 1
    setHasWorkspaceScroll(hasOverflow)

    if (!hasOverflow) {
      setIsWorkspaceScrollAtBottom(true)
      setIsWorkspaceScrollAtTop(true)
      return
    }

    const isAtBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <= 1
    const isAtTop = element.scrollTop <= 1
    setIsWorkspaceScrollAtBottom(isAtBottom)
    setIsWorkspaceScrollAtTop(isAtTop)
  }, [])

  const handleWorkspaceScroll = useCallback(() => {
    const element = scrollContainerRef.current
    if (!element) return

    const isAtBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <= 1
    const isAtTop = element.scrollTop <= 1

    setIsWorkspaceScrollAtBottom((prev) =>
      prev === isAtBottom ? prev : isAtBottom
    )
    setIsWorkspaceScrollAtTop((prev) => (prev === isAtTop ? prev : isAtTop))
  }, [])

  const handleWorkspaceContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      scrollContainerRef.current = node
      setWorkspaceDropRef(node)

      if (!node) {
        setHasWorkspaceScroll(false)
        setIsWorkspaceScrollAtBottom(true)
        setIsWorkspaceScrollAtTop(true)
        return
      }

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserverRef.current = new ResizeObserver(() => {
          updateWorkspaceScrollState()
        })
        resizeObserverRef.current.observe(node)
      }

      updateWorkspaceScrollState()
    },
    [setWorkspaceDropRef, updateWorkspaceScrollState]
  )

  useEffect(() => {
    updateWorkspaceScrollState()
  }, [entries, expandedDirectories, updateWorkspaceScrollState])

  return {
    hasWorkspaceScroll,
    isWorkspaceScrollAtBottom,
    isWorkspaceScrollAtTop,
    handleWorkspaceScroll,
    handleWorkspaceContainerRef,
  }
}

