import { KEYS, type Value } from 'platejs'
import { useEffect, useRef } from 'react'
import { useTabStore } from '@/store/tab-store'
import {
  getFileNameWithoutExtension,
  sanitizeFilename,
} from '@/utils/path-utils'

const UNTITLED_PATTERN = /^Untitled( \d+)?$/

/**
 * Link the active tab name to the first heading on initial load (per tab id).
 * Prevents relinking after a manual rename; resets when the tab id changes.
 */
export function useLinkedTabName(path: string, value: Value) {
  const hasLinkedForTab = useRef(false)
  const setLinkedTab = useTabStore((s) => s.setLinkedTab)

  // Link the tab name to the first heading on initial render if conditions match
  useEffect(() => {
    if (hasLinkedForTab.current) {
      return
    }

    const firstHeading = sanitizeFilename(getFirstHeadingText(value))

    const name = getFileNameWithoutExtension(path)
    const isUntitled = UNTITLED_PATTERN.test(name)
    const matchesHeading = firstHeading === name

    if (!matchesHeading && !isUntitled) {
      return
    }

    setLinkedTab({ path, name: firstHeading || name })
    hasLinkedForTab.current = true
  }, [path, setLinkedTab, value])
}

function getFirstHeadingText(value: Value): string {
  if (!Array.isArray(value) || value.length === 0) {
    return ''
  }

  const firstBlock = value[0] as any

  if (!firstBlock || typeof firstBlock.type !== 'string') {
    return ''
  }

  if (!KEYS.heading.includes(firstBlock.type)) {
    return ''
  }

  return extractTextFromNode(firstBlock)
}

function extractTextFromNode(node: any): string {
  if (typeof node === 'string') {
    return node
  }
  if (node?.text) {
    return node.text
  }
  if (Array.isArray(node?.children)) {
    return node.children.map(extractTextFromNode).join('')
  }
  return ''
}
