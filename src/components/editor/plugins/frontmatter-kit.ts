import { createPlatePlugin } from 'platejs/react'
import { memo } from 'react'
import { FrontmatterElement } from '../ui/node-frontmatter'

export const FRONTMATTER_KEY = 'frontmatter'

export const frontmatterPlugin = createPlatePlugin({
  key: FRONTMATTER_KEY,
  node: {
    component: memo(FrontmatterElement, () => true),
    isElement: true,
    isVoid: true,
  },
})

export const FrontmatterKit = [frontmatterPlugin]
