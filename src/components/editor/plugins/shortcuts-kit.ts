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

export const CmdAPlugin = createPlatePlugin({
  key: 'cmd-a',
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.key === 'a' && event.metaKey) {
        event.preventDefault()
        event.stopPropagation()
        selectAllLikeCmdA(editor)
      }
    },
  },
})

export const CmdXPlugin = createPlatePlugin({
  key: 'cmd-x',
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.key === 'x' && event.metaKey) {
        // This handler doesn’t seem to run when the block is already selected
        // but it remains as defensive code.
        const isBlockSelecting = editor.getOption(
          BlockSelectionPlugin,
          'isSelectingSome'
        )
        if (isBlockSelecting) return

        const sel = editor.selection
        if (!sel) return

        const pointsEqual = (a: typeof sel.anchor, b: typeof sel.anchor) =>
          a.offset === b.offset &&
          a.path.length === b.path.length &&
          a.path.every((v, i) => v === b.path[i])

        // Only intercept Cmd+X when selection is collapsed
        if (!pointsEqual(sel.anchor, sel.focus)) return

        // Find the top-level block at the caret
        const entry = editor.api.above({
          at: sel.anchor,
          match: editor.api.isBlock,
          mode: 'highest',
        })

        if (!entry) return

        const [node, path] = entry

        // Copy the current block as Markdown instead of plain text
        const markdown = editor
          .getApi(MarkdownPlugin)
          .markdown.serialize({ value: [node as any] })
        navigator.clipboard.writeText(markdown)

        editor.tf.removeNodes({ at: path })

        event.preventDefault()
        event.stopPropagation()
      }
    },
  },
})

export const ShortcutsKit = [CmdAPlugin, CmdXPlugin]
