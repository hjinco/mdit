import { useDraggable, useDroppable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { isType, KEYS } from 'platejs'
import {
  createPlatePlugin,
  type PlateElementProps,
  type RenderNodeWrapper,
} from 'platejs/react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import { FRONTMATTER_KEY } from './frontmatter-kit'

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

function DragHandle({
  elementId,
  type,
  onDraggingChange,
}: {
  elementId: string
  type: string
  onDraggingChange?: (isDragging: boolean) => void
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `editor-${elementId}`,
    data: { kind: 'editor', id: elementId },
  })

  const isFocusMode = useEditorStore((s) => s.isFocusMode)

  // Notify parent component when dragging state changes
  useEffect(() => {
    onDraggingChange?.(isDragging)
  }, [isDragging, onDraggingChange])

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        'absolute -left-7 flex py-1 rounded-xs',
        'opacity-0 transition-opacity group-hover:opacity-100 will-change-[opacity]',
        'cursor-grab active:cursor-grabbing',
        'text-muted-foreground/80 hover:text-foreground hover:bg-accent/50 z-50',
        isFocusMode && 'opacity-0 group-hover:opacity-0',
        type === KEYS.codeBlock
          ? 'top-1'
          : type === KEYS.table
            ? 'top-5'
            : type === KEYS.img
              ? 'top-2'
              : type === KEYS.blockquote
                ? '-top-0.5'
                : type === KEYS.callout
                  ? 'top-0'
                  : 'top-0.5'
      )}
    >
      <GripVertical className="size-5 stroke-[1.4]!" />
    </div>
  )
}

function Draggable(props: PlateElementProps) {
  const { setNodeRef: setDropRef, isOver: isOverDnd } = useDroppable({
    id: `editor-${props.element.id}`,
    data: { kind: 'editor', id: props.element.id },
  })

  const [isDragging, setIsDragging] = useState(false)

  const shouldHighlight = isOverDnd

  // If not the outermost node, render only children
  if (props.path.length !== 1 || props.element.type === FRONTMATTER_KEY) {
    return <>{props.children}</>
  }

  // For outermost nodes, render full wrapper with drag handle and drop zone
  return (
    <div
      ref={setDropRef}
      className={cn(
        'group relative transition-opacity',
        isDragging && 'opacity-30'
      )}
    >
      {props.element.id != null && (
        <DragHandle
          elementId={props.element.id as string}
          type={props.element.type}
          onDraggingChange={setIsDragging}
        />
      )}
      {shouldHighlight && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px]',
            'bg-blue-400 dark:bg-blue-600/80'
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
