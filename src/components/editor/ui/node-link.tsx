import { getLinkAttributes } from '@platejs/link'
import type { TLinkElement } from 'platejs'
import type { PlateElementProps } from 'platejs/react'
import { PlateElement } from 'platejs/react'

type TLinkElementWithWiki = TLinkElement & {
  wiki?: boolean
  wikiTarget?: string
}

export function LinkElement(props: PlateElementProps<TLinkElementWithWiki>) {
  return (
    <PlateElement
      {...props}
      as="a"
      className="font-medium text-primary underline decoration-primary underline-offset-4 break-all"
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
        onMouseOver: (e) => {
          e.stopPropagation()
        },
      }}
    >
      {props.children}
    </PlateElement>
  )
}
