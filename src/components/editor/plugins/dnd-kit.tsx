import { isType, KEYS } from 'platejs'
import { createPlatePlugin, type RenderNodeWrapper } from 'platejs/react'
import { useMemo } from 'react'
import { Draggable } from '../ui/block-draggable'

const UNDRAGGABLE_KEYS = [KEYS.tr, KEYS.td]

export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props
  const enabled = useMemo(() => {
    if (editor.dom.readOnly) return false
    if (path.length === 1 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      return true
    }
    if (path.length === 4 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      const block = editor.api.some({
        at: path,
        match: {
          type: editor.getType(KEYS.table),
        },
      })
      if (block) {
        return true
      }
    }
    return false
  }, [editor, element, path])
  if (!enabled) return
  return (props) => <Draggable {...props} />
}

const DndPlugin = createPlatePlugin({
  key: 'dnd',
  render: {
    aboveNodes: BlockDraggable,
  },
})

export const DndKit = [DndPlugin]
