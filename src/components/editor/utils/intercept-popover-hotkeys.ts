import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

function haltEvent(event: ReactKeyboardEvent<Element>) {
  event.preventDefault()
  event.stopPropagation()

  const nativeEvent = event.nativeEvent
  if ('stopImmediatePropagation' in nativeEvent) {
    nativeEvent.stopImmediatePropagation()
  }
}

// The popover lives inside the editor tree, so we hijack these hotkeys and
// emulate the native cut behaviours without bubbling upward.
export function interceptPopoverHotkeys(event: ReactKeyboardEvent<Element>) {
  const isMetaCombo = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()

  if (!isMetaCombo || key !== 'x') {
    return
  }

  const target =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
      ? (event.target as HTMLInputElement | HTMLTextAreaElement)
      : null

  haltEvent(event)

  if (!target) {
    return
  }

  const selectionStart = target.selectionStart ?? 0
  const selectionEnd = target.selectionEnd ?? selectionStart

  if (selectionStart === selectionEnd) {
    return
  }

  const selectedText = target.value.slice(selectionStart, selectionEnd)

  if (selectedText) {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(selectedText)
      } else {
        document.execCommand('copy')
      }
    } catch {
      try {
        document.execCommand('copy')
      } catch {
        // ignore clipboard errors
      }
    }
  }

  const nextValue =
    target.value.slice(0, selectionStart) + target.value.slice(selectionEnd)

  if (nextValue === target.value) {
    return
  }

  target.value = nextValue

  target.setSelectionRange(selectionStart, selectionStart)

  target.dispatchEvent(new Event('input', { bubbles: true }))
}
