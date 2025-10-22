import type { PlateElementProps } from 'platejs/react'

import { PlateElement } from 'platejs/react'

import { cn } from '@/lib/utils'

export function ParagraphElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} className={cn('my-0.5 px-0 py-1')}>
      {props.children}
    </PlateElement>
  )
}
