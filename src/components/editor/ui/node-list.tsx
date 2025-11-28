import { getListSiblings, isOrderedList } from '@platejs/list'
import {
  useTodoListElement,
  useTodoListElementState,
} from '@platejs/list/react'
import type { CheckedState } from '@radix-ui/react-checkbox'
import type { TListElement } from 'platejs'
import { KEYS } from 'platejs'
import {
  type PlateElementProps,
  type RenderNodeWrapper,
  useReadOnly,
} from 'platejs/react'
import { useCallback } from 'react'
import { useConfetti } from '@/contexts/confetti-context'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/ui/checkbox'

const config: Record<
  string,
  {
    Li: React.FC<PlateElementProps>
    Marker: React.FC<PlateElementProps>
  }
> = {
  [KEYS.listTodo]: {
    Li: TodoLi,
    Marker: TodoMarker,
  },
}

export const BlockList: RenderNodeWrapper = (props) => {
  if (!props.element.listStyleType) return

  return (props) => <List {...props} />
}

function List(props: PlateElementProps) {
  const { listStart, listStyleType } = props.element as TListElement
  const { Li, Marker } = config[listStyleType] ?? {}
  const List = isOrderedList(props.element) ? 'ol' : 'ul'

  return (
    <List
      className="relative m-0 p-0"
      style={{ listStyleType }}
      start={listStart}
    >
      {Marker && <Marker {...props} />}
      {Li ? <Li {...props} /> : <li>{props.children}</li>}
    </List>
  )
}

function TodoMarker(props: PlateElementProps) {
  const state = useTodoListElementState({ element: props.element })
  const { checkboxProps } = useTodoListElement(state)
  const readOnly = useReadOnly()
  const confetti = useConfetti()
  const { onCheckedChange, ...restCheckboxProps } = checkboxProps

  const handleCheckedChange = useCallback(
    (value: CheckedState) => {
      if (value === 'indeterminate') return
      onCheckedChange(value)
      if (readOnly || value !== true || !confetti) return

      const path = state.editor.api.findPath(state.element)
      if (!path) return

      if (state.element.indent !== 1) return

      const siblings = getListSiblings(state.editor, [state.element, path], {
        query: (node) => node.listStyleType === state.element.listStyleType,
      })

      if (
        siblings.length > 0 &&
        siblings.every(([node]) =>
          node === state.element || node.id === state.element.id
            ? value === true
            : Boolean(node.checked)
        )
      ) {
        confetti.fireConfetti()
      }
    },
    [confetti, onCheckedChange, readOnly, state.editor, state.element]
  )

  return (
    <div contentEditable={false}>
      <Checkbox
        className={cn(
          'absolute top-1 -left-6',
          readOnly && 'pointer-events-none'
        )}
        onCheckedChange={handleCheckedChange}
        {...restCheckboxProps}
      />
    </div>
  )
}

function TodoLi(props: PlateElementProps) {
  return (
    <li
      className={cn(
        'list-none',
        (props.element.checked as boolean) &&
          'text-muted-foreground line-through'
      )}
    >
      {props.children}
    </li>
  )
}
