import { MarkdownPlugin } from '@platejs/markdown'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { PointApi } from 'platejs'
import { createPlatePlugin, type PlateEditor } from 'platejs/react'

function decodeHtmlEntities(html: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = html
  return textarea.value
}

export function selectAllLikeCmdA(editor: PlateEditor) {
  const sel = editor.selection
  if (!sel) return

  const edges = editor.api.edges(sel)
  if (!edges) return

  const edgeStart = edges[0]
  const edgeEnd = edges[1]

  const startEntry = editor.api.above({
    at: edgeStart,
    match: editor.api.isBlock,
    mode: 'highest',
  })
  const endEntry = editor.api.above({
    at: edgeEnd,
    match: editor.api.isBlock,
    mode: 'highest',
  })
  if (!startEntry || !endEntry) return

  const [startNode, startPath] = startEntry
  const [endNode, endPath] = endEntry

  if (
    startNode.type === 'code_block' ||
    endNode.type === 'code_block' ||
    // TODO: improve table selection
    startNode.type === 'table' ||
    endNode.type === 'table'
  ) {
    return
  }

  const start = editor.api.start(startPath)
  const end = editor.api.end(endPath)
  if (!start || !end) return

  const isFullBlockSelected =
    PointApi.equals(edgeStart, start) && PointApi.equals(edgeEnd, end)

  if (isFullBlockSelected) {
    editor.getApi(BlockSelectionPlugin).blockSelection.selectAll()
    editor.tf.deselect()
    return
  }

  editor.tf.select({
    anchor: start,
    focus: end,
  })
  editor.tf.focus()
}

function copyOrCutSelection(editor: PlateEditor, action: 'copy' | 'cut') {
  // Use the logic for current selection or block
  const sel = editor.selection
  if (!sel) return

  // If the selection is expanded, copy/cut the exact fragment
  if (!PointApi.equals(sel.anchor, sel.focus)) {
    const fragment = editor.api.fragment()
    if (!fragment || fragment.length === 0) return

    const markdown = editor
      .getApi(MarkdownPlugin)
      .markdown.serialize({ value: fragment as any })

    const decoded = decodeHtmlEntities(markdown)
    navigator.clipboard.writeText(decoded)

    if (action === 'cut') {
      editor.tf.deleteFragment()
    }
    return
  }

  // Find the top-level block at the caret and copy/cut it as Markdown
  const entry = editor.api.above({
    at: sel.anchor,
    match: editor.api.isBlock,
    mode: 'highest',
  })

  if (!entry) return

  const [node, path] = entry

  const markdown = editor
    .getApi(MarkdownPlugin)
    .markdown.serialize({ value: [node as any] })

  const decoded = decodeHtmlEntities(markdown)
  navigator.clipboard.writeText(decoded)

  if (action === 'cut') {
    editor.tf.removeNodes({ at: path })
  }
}

export function cutSelection(editor: PlateEditor) {
  copyOrCutSelection(editor, 'cut')
}

export function copySelection(editor: PlateEditor) {
  copyOrCutSelection(editor, 'copy')
}

export function moveBlockUp(editor: PlateEditor) {
  // Use the logic for current selection
  const sel = editor.selection
  if (!sel) return

  // Check if selection spans multiple blocks
  if (!PointApi.equals(sel.anchor, sel.focus)) {
    const edges = editor.api.edges(sel)
    if (!edges) return

    const [edgeStart, edgeEnd] = edges

    const startEntry = editor.api.above({
      at: edgeStart,
      match: editor.api.isBlock,
      mode: 'highest',
    })
    const endEntry = editor.api.above({
      at: edgeEnd,
      match: editor.api.isBlock,
      mode: 'highest',
    })

    if (!startEntry || !endEntry) return

    const [, startPath] = startEntry
    const [, endPath] = endEntry

    // Check if we can move up
    if (startPath.at(-1) === 0) return // Already at the top

    // If selection spans multiple blocks, move them all
    if (
      !PointApi.equals(edgeStart, edgeEnd) ||
      startPath.length !== endPath.length
    ) {
      const startIndex = startPath.at(-1) as number
      const endIndex = endPath.at(-1) as number

      // Move all blocks in the range
      for (let i = startIndex; i <= endIndex; i++) {
        const path = [...startPath]
        path[path.length - 1] = i

        const targetPath = [...path]
        targetPath[targetPath.length - 1] -= 1

        editor.tf.moveNodes({
          at: path,
          to: targetPath,
        })
      }
      return
    }
  }

  // Handle single block/cursor position
  const entry = editor.api.above({
    at: sel.anchor,
    match: editor.api.isBlock,
    mode: 'highest',
  })

  if (!entry) return

  const [, path] = entry

  // Check if we can move up
  if (path.at(-1) === 0) return // Already at the top

  // Calculate the target path
  const targetPath = [...path]
  targetPath[targetPath.length - 1] -= 1

  editor.tf.moveNodes({
    at: path,
    to: targetPath,
  })
}

export function moveBlockDown(editor: PlateEditor) {
  // Use the logic for current selection
  const sel = editor.selection
  if (!sel) return

  // Check if selection spans multiple blocks
  if (!PointApi.equals(sel.anchor, sel.focus)) {
    const edges = editor.api.edges(sel)
    if (!edges) return

    const [edgeStart, edgeEnd] = edges

    const startEntry = editor.api.above({
      at: edgeStart,
      match: editor.api.isBlock,
      mode: 'highest',
    })
    const endEntry = editor.api.above({
      at: edgeEnd,
      match: editor.api.isBlock,
      mode: 'highest',
    })

    if (!startEntry || !endEntry) return

    const [, startPath] = startEntry
    const [, endPath] = endEntry

    // Get the parent to check bounds
    const parent = editor.api.parent(endPath)
    if (!parent) return

    const [parentNode] = parent
    if (!('children' in parentNode)) return

    const endIndex = endPath.at(-1) as number
    const childrenLength = (parentNode.children as any[]).length

    // Check if we can move down
    if (endIndex >= childrenLength - 1) return // Already at the bottom

    // If selection spans multiple blocks, move them all
    if (
      !PointApi.equals(edgeStart, edgeEnd) ||
      startPath.length !== endPath.length
    ) {
      const startIndex = startPath.at(-1) as number

      // Move all blocks in the range (in reverse order)
      for (let i = endIndex; i >= startIndex; i--) {
        const path = [...startPath]
        path[path.length - 1] = i

        const targetPath = [...path]
        targetPath[targetPath.length - 1] += 1

        editor.tf.moveNodes({
          at: path,
          to: targetPath,
        })
      }
      return
    }
  }

  // Handle single block/cursor position
  const entry = editor.api.above({
    at: sel.anchor,
    match: editor.api.isBlock,
    mode: 'highest',
  })

  if (!entry) return

  const [, path] = entry

  // Get the parent to check bounds
  const parent = editor.api.parent(path)
  if (!parent) return

  const [parentNode] = parent
  if (!('children' in parentNode)) return

  const currentIndex = path.at(-1) as number
  const childrenLength = (parentNode.children as any[]).length

  // Check if we can move down
  if (currentIndex >= childrenLength - 1) return // Already at the bottom

  // Calculate the target path (swap with the next sibling)
  const targetPath = [...path]
  targetPath[targetPath.length - 1] = currentIndex + 1

  editor.tf.moveNodes({
    at: path,
    to: targetPath,
  })
}

export const ShortcutsPlugin = createPlatePlugin({
  key: 'shortcuts',
  shortcuts: {
    selectAll: {
      keys: 'mod+a',
      handler: ({ editor }) => {
        selectAllLikeCmdA(editor)
        true
      },
    },
    copy: {
      keys: 'mod+c',
      handler: ({ editor }) => {
        copySelection(editor)
        return true
      },
    },
    cut: {
      keys: 'mod+x',
      handler: ({ editor }) => {
        cutSelection(editor)
        return true
      },
    },
    moveUp: {
      keys: 'alt+arrowup',
      handler: ({ editor }) => {
        moveBlockUp(editor)
        return true
      },
    },
    moveDown: {
      keys: 'alt+arrowdown',
      handler: ({ editor }) => {
        moveBlockDown(editor)
        return true
      },
    },
  },
})

export const ShortcutsKit = [ShortcutsPlugin]
