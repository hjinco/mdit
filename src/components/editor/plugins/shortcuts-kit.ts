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
