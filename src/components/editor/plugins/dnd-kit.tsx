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

const headingTopMap: Record<string, string> = {
  [KEYS.h1]: 'top-11',
  [KEYS.h2]: 'top-6.5',
  [KEYS.h3]: 'top-5',
  [KEYS.h4]: 'top-3.5',
  [KEYS.h5]: 'top-5',
  [KEYS.h6]: 'top-6',
}

const otherTypeTopMap: Record<string, string> = {
  [KEYS.codeBlock]: 'top-1',
  [KEYS.table]: 'top-5',
  [KEYS.img]: 'top-2',
  [KEYS.blockquote]: 'top-0.5',
  [KEYS.callout]: 'top-0',
}

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
  isFirstChild,
  onDraggingChange,
  onMouseDown,
}: {
  elementId: string
  type: string
  isFirstChild: boolean
  onDraggingChange: (isDragging: boolean) => void
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `editor-${elementId}`,
    data: { kind: 'editor', id: elementId },
  })

  const isFocusMode = useEditorStore((s) => s.isFocusMode)

  // Notify parent component when dragging state changes
  useEffect(() => {
    onDraggingChange(isDragging)
  }, [isDragging, onDraggingChange])

  const topClass =
    isFirstChild && headingTopMap[type]
      ? 'top-0.75'
      : headingTopMap[type] || otherTypeTopMap[type] || ''

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
        'top-0.75',
        topClass
      )}
      contentEditable={false}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onMouseDown={onMouseDown}
    >
      <GripVertical className="size-5 stroke-[1.4]!" />
    </div>
  )
}

function Draggable(props: PlateElementProps) {
  const [isDragging, setIsDragging] = useState(false)

  const elementId = props.element.id as string
  const isFirstChild = props.path.length === 1 && props.path[0] === 0

  // Top drop zone - always call hooks, but only use when valid
  const {
    setNodeRef: setTopDropRef,
    isOver: isOverTop,
    active: activeTop,
  } = useDroppable({
    id: `editor-${elementId}-top`,
    data: { kind: 'editor', id: elementId, position: 'top' },
  })

  // Bottom drop zone - always call hooks, but only use when valid
  const {
    setNodeRef: setBottomDropRef,
    isOver: isOverBottom,
    active: activeBottom,
  } = useDroppable({
    id: `editor-${elementId}-bottom`,
    data: { kind: 'editor', id: elementId, position: 'bottom' },
  })

  // Check if the active drag item is the same as this element
  const activeId = activeTop?.data.current?.id || activeBottom?.data.current?.id
  const isSelfDrag = activeId === elementId

  // If not the outermost node, render only children
  if (
    !elementId ||
    props.path.length > 1 ||
    props.element.type === FRONTMATTER_KEY
  ) {
    return <>{props.children}</>
  }

  return (
    <div
      className={cn(
        'group relative transition-opacity flow-root',
        isDragging && 'opacity-30'
      )}
    >
      <DragHandle
        elementId={elementId}
        type={props.element.type}
        isFirstChild={isFirstChild}
        onDraggingChange={setIsDragging}
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        data-plate-prevent-deselect
      />
      {/* Top drop zone */}
      <div
        ref={setTopDropRef}
        className="absolute inset-x-0 top-0 h-1/2 z-10"
        style={{ pointerEvents: 'none' }}
        contentEditable={false}
      />
      {/* Bottom drop zone */}
      <div
        ref={setBottomDropRef}
        className="absolute inset-x-0 bottom-0 h-1/2 z-10"
        style={{ pointerEvents: 'none' }}
        contentEditable={false}
      />
      {props.children}
      {/* Top drop line */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 -top-px h-0.5',
          'bg-blue-400 dark:bg-blue-600/80',
          'opacity-0 transition-opacity',
          isOverTop && !isSelfDrag && 'opacity-100'
        )}
        contentEditable={false}
      />
      {/* Bottom drop line */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 -bottom-px h-0.5',
          'bg-blue-400 dark:bg-blue-600/80',
          'opacity-0 transition-opacity',
          isOverBottom && !isSelfDrag && 'opacity-100'
        )}
        contentEditable={false}
      />
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
