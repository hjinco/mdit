import { useBlockSelected } from '@platejs/selection/react'
import type { PlateElementProps } from 'platejs/react'

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
      className="pointer-events-none absolute inset-0 z-1 bg-brand/[.11] rounded"
      data-slot="block-selection"
    />
  )
}
