import { computeDiff } from '@platejs/diff'
import type { Descendant, TElement } from 'platejs'
import { createPlatePlugin, type PlateElementProps } from 'platejs/react'
import { cn } from '@/lib/utils'
import { DIFF_STYLES, DiffLeaf, type DiffOpType } from '../ui/node-diff'

export function getDiff(doc0: Descendant[], doc1: Descendant[]) {
  return computeDiff(doc0, doc1, {
    ignoreProps: ['id'],
  })
}

export function withDiffStyle<T extends TElement>(
  Comp: React.ComponentType<PlateElementProps<T>>
) {
  return function DiffStyled(props: PlateElementProps<T>) {
    const diff = (props.element.diffOperation as { type: DiffOpType })?.type
    const className = DIFF_STYLES[diff]
    return (
      <Comp
        {...props}
        attributes={{
          ...props.attributes,
          className: cn(props.attributes.className, className),
        }}
      />
    )
  }
}

const DiffPlugin = createPlatePlugin({
  key: 'diff',
  node: {
    isLeaf: true,
    component: DiffLeaf,
  },
})

export const DiffKit = [DiffPlugin]
