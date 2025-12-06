import { useDroppable } from '@dnd-kit/core'
import { isType, KEYS } from 'platejs'
import {
  createPlatePlugin,
  type PlateElementProps,
  type RenderNodeWrapper,
} from 'platejs/react'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

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

function Draggable(props: PlateElementProps) {
  const { setNodeRef, isOver: isOverDnd } = useDroppable({
    id: `editor-${props.element.id}`,
    data: { kind: 'editor', id: props.element.id },
  })

  const shouldHighlight = isOverDnd

  return (
    <div ref={setNodeRef} className="relative">
      {shouldHighlight && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 h-px',
            'bg-blue-400 dark:bg-blue-600'
          )}
        />
      )}
      {props.children}
    </div>
  )
}

const DndPlugin = createPlatePlugin({
  key: 'dnd',
  render: {
    aboveNodes: BlockDraggable,
  },
})

export const DndKit = [DndPlugin]
