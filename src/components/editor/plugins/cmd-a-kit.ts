import { BlockSelectionPlugin } from '@platejs/selection/react'
import { createPlatePlugin } from 'platejs/react'

export const CmdAPlugin = createPlatePlugin({
  key: 'cmd-a',
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.key === 'a' && event.metaKey) {
        event.preventDefault()
        event.stopPropagation()

        const sel = editor.selection
        if (!sel) return

        const startEntry = editor.api.above({
          at: sel.anchor,
          match: editor.api.isBlock,
          mode: 'highest',
        })
        const endEntry = editor.api.above({
          at: sel.focus,
          match: editor.api.isBlock,
          mode: 'highest',
        })
        if (!startEntry || !endEntry) return

        let [, startPath] = startEntry
        let [, endPath] = endEntry

        // when dragging backwards
        if (startPath[0] > endPath[0]) {
          const tmp = startPath
          startPath = endPath
          endPath = tmp
        }

        const start = editor.api.start(startPath)
        const end = editor.api.end(endPath)

        if (!start || !end) return

        const pointsEqual = (a: typeof sel.anchor, b: typeof sel.anchor) =>
          a.offset === b.offset &&
          a.path.length === b.path.length &&
          a.path.every((v, i) => v === b.path[i])

        // Consider both single and multiple blocks when selection aligns to
        // the exact block boundaries from first block start to last block end.
        const isFullBlockSelected =
          (pointsEqual(sel.anchor, start) && pointsEqual(sel.focus, end)) ||
          (pointsEqual(sel.anchor, end) && pointsEqual(sel.focus, start))

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
    },
  },
})

export const CmdAKit = [CmdAPlugin]
