import { TocPlugin } from '@platejs/toc/react'

import { TocElement } from '../ui/node-toc'

export const TocKit = [
  TocPlugin.configure({
    options: {
      topOffset: 80,
    },
  }).withComponent(TocElement),
]
