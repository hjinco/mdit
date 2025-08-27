import type { TText } from 'platejs'
import {
  PlateElement,
  type PlateElementProps,
  PlateLeaf,
  type PlateLeafProps,
} from 'platejs/react'

export const KEY_DIFF = 'diff'

export type DiffOpType = 'insert' | 'delete' | 'update'

export type DiffLeafText = TText & {
  diff?: boolean
  diffOperation?: { type: DiffOpType }
}

export const DIFF_STYLES: Record<DiffOpType, string> = {
  insert: 'bg-blue-500/10 text-blue-500 no-underline',
  delete: 'bg-foreground/5 text-foreground/35 line-through no-underline',
  update: 'bg-yellow-500/10 text-yellow-500 no-underline',
}

export const DiffElement = ({
  attributes,
  children,
  element,
  ...props
}: PlateElementProps) => {
  const diffOperation = element.diffOperation as
    | { type: DiffOpType }
    | undefined
  const op = diffOperation?.type

  let className = ''

  if (op === 'delete') {
    className = DIFF_STYLES.delete
  } else if (op === 'insert') {
    className = DIFF_STYLES.insert
  } else if (op === 'update') {
    className = DIFF_STYLES.update
  }

  return (
    <PlateElement
      {...props}
      attributes={attributes}
      element={element}
      className={className}
    >
      {children}
    </PlateElement>
  )
}

export const DiffLeaf = ({
  children,
  leaf,
  ...props
}: PlateLeafProps<DiffLeafText>) => {
  const op = leaf.diffOperation?.type

  if (op === 'delete') {
    return (
      <PlateLeaf
        className="bg-foreground/5 text-foreground/35 no-underline"
        as="del"
        leaf={leaf}
        {...props}
      >
        {children}
      </PlateLeaf>
    )
  }

  if (op === 'insert') {
    return (
      <PlateLeaf
        className="bg-blue-500/10 text-blue-500 no-underline"
        as="ins"
        leaf={leaf}
        {...props}
      >
        {children}
      </PlateLeaf>
    )
  }

  if (op === 'update') {
    return (
      <PlateLeaf
        className="bg-yellow-500/10 text-yellow-500"
        as="mark"
        leaf={leaf}
        {...props}
      >
        {children}
      </PlateLeaf>
    )
  }

  return (
    <PlateLeaf {...props} leaf={leaf}>
      {children}
    </PlateLeaf>
  )
}
