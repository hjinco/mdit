import { useBlockSelected } from '@platejs/selection/react'
import { cva } from 'class-variance-authority'
import type { PlateElementProps } from 'platejs/react'

export const blockSelectionVariants = cva(
  'pointer-events-none absolute inset-0 z-1 bg-brand/[.11] transition-opacity rounded',
  {
    defaultVariants: {
      active: true,
    },
    variants: {
      active: {
        false: 'opacity-0',
        true: 'opacity-100',
      },
    },
  }
)

export function BlockSelection(props: PlateElementProps) {
  const isBlockSelected = useBlockSelected()

  if (
    !isBlockSelected ||
    props.plugin.key === 'tr' ||
    props.plugin.key === 'table'
  )
    return null

  return (
    <div
      className={blockSelectionVariants({
        active: isBlockSelected,
      })}
      data-slot="block-selection"
    />
  )
}
