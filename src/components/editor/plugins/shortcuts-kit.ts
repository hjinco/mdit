import { MarkdownPlugin } from '@platejs/markdown'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { PointApi } from 'platejs'
import { createPlatePlugin, type PlateEditor } from 'platejs/react'

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
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
  const selectedBlocks = blockSelectionApi.blockSelection.getNodes()

  // If there are selected blocks, use block selection logic
  if (selectedBlocks.length > 0) {
    const nodes = selectedBlocks.map(([node]) => node)
    const markdown = editor
      .getApi(MarkdownPlugin)
      .markdown.serialize({ value: nodes as any })

    navigator.clipboard.writeText(markdown)
    if (action === 'cut') {
      editor.getTransforms(BlockSelectionPlugin).blockSelection.removeNodes()
    }
    return
  }

  // Otherwise, use the logic for current selection or block
  const sel = editor.selection
  if (!sel) return

  // If the selection is expanded, copy/cut the exact fragment
  if (!PointApi.equals(sel.anchor, sel.focus)) {
    const fragment = editor.api.fragment()
    if (!fragment || fragment.length === 0) return

    const markdown = editor
      .getApi(MarkdownPlugin)
      .markdown.serialize({ value: fragment as any })

    navigator.clipboard.writeText(markdown)
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
  navigator.clipboard.writeText(markdown)
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

export async function pasteSelection(
  editor: PlateEditor,
  data?: DataTransfer | null
): Promise<void> {
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
  if (blockSelectionApi.blockSelection.getNodes().length === 0) return

  let markdown = ''

  if (data) {
    try {
      markdown = data.getData('text/plain')
    } catch {
      markdown = ''
    }
  }

  if (!markdown && navigator.clipboard?.readText) {
    try {
      markdown = await navigator.clipboard.readText()
    } catch {
      markdown = ''
    }
  }

  if (!markdown) return

  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n')
  const markdownApi = editor.getApi(MarkdownPlugin).markdown

  let fragment: any[]
  try {
    fragment = markdownApi.deserialize(normalizedMarkdown) as any[]
  } catch {
    return
  }

  if (!Array.isArray(fragment) || fragment.length === 0) return

  editor.getTransforms(BlockSelectionPlugin).blockSelection.select()
  editor.tf.insertFragment(fragment as any)
  editor.tf.focus()
}

export function moveBlockUp(editor: PlateEditor) {
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
  const selectedBlocks = blockSelectionApi.blockSelection.getNodes()

  // If there are block-selected blocks, move them up
  if (selectedBlocks.length > 0) {
    const firstPath = selectedBlocks[0][1]

    // Check if we can move up
    if (firstPath.at(-1) === 0) return // Already at the top

    // Move all selected blocks up
    for (const [, path] of selectedBlocks) {
      const targetPath = [...path]
      targetPath[targetPath.length - 1] -= 1

      editor.tf.moveNodes({
        at: path,
        to: targetPath,
      })
    }
    return
  }

  // Otherwise, use the logic for current selection
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
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
  const selectedBlocks = blockSelectionApi.blockSelection.getNodes()

  // If there are block-selected blocks, move them down
  if (selectedBlocks.length > 0) {
    const lastPath = selectedBlocks.at(-1)?.[1]
    if (!lastPath) return

    // Get the parent to check bounds
    const parent = editor.api.parent(lastPath)
    if (!parent) return

    const [parentNode] = parent
    if (!('children' in parentNode)) return

    const lastIndex = lastPath.at(-1) as number
    const childrenLength = (parentNode.children as any[]).length

    // Check if we can move down
    if (lastIndex >= childrenLength - 1) return // Already at the bottom

    // Move all selected blocks down (in reverse order to maintain positions)
    for (let i = selectedBlocks.length - 1; i >= 0; i--) {
      const [, path] = selectedBlocks[i]
      const targetPath = [...path]
      targetPath[targetPath.length - 1] += 1

      editor.tf.moveNodes({
        at: path,
        to: targetPath,
      })
    }
    return
  }

  // Otherwise, use the logic for current selection
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
      },
    },
  },
})

export const ShortcutsKit = [ShortcutsPlugin]
