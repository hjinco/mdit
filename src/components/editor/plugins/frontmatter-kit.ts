import { createPlatePlugin } from 'platejs/react'
import { FrontmatterElement } from '../ui/node-frontmatter'

export const FRONTMATTER_KEY = 'frontmatter'

export const frontmatterPlugin = createPlatePlugin({
  key: FRONTMATTER_KEY,
  node: {
    component: FrontmatterElement,
    isElement: true,
  },
  handlers: {
    onKeyDown: ({ event }) => {
      event.stopPropagation()
    },
  },
})

export const FrontmatterKit = [frontmatterPlugin]
