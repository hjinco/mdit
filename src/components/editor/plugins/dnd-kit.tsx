import { useDraggable, useDroppable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { isType, KEYS } from 'platejs'
import {
  createPlatePlugin,
  type PlateElementProps,
  type RenderNodeWrapper,
} from 'platejs/react'
import { useMemo } from 'react'
import { useFocusMode } from '@/contexts/focus-mode-context'
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

function DragHandle({ elementId }: { elementId: string }) {
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: `editor-${elementId}`,
    data: { kind: 'editor', id: elementId },
  })

  const { isFocusMode } = useFocusMode()

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'absolute -left-6 top-2 flex h-full',
        'opacity-0 transition-opacity group-hover:opacity-100',
        'cursor-grab active:cursor-grabbing',
        'text-muted-foreground hover:text-foreground z-50',
        isFocusMode && 'opacity-0 group-hover:opacity-0'
      )}
    >
      <GripVertical className="size-4" />
    </div>
  )
}

function Draggable(props: PlateElementProps) {
  const { setNodeRef: setDropRef, isOver: isOverDnd } = useDroppable({
    id: `editor-${props.element.id}`,
    data: { kind: 'editor', id: props.element.id },
  })

  const shouldHighlight = isOverDnd

  // If not the outermost node, render only children
  if (props.path.length !== 1) {
    return <>{props.children}</>
  }

  // For outermost nodes, render full wrapper with drag handle and drop zone
  return (
    <div ref={setDropRef} className="group relative">
      <DragHandle elementId={props.element.id as string} />
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
