import { IndentPlugin } from '@platejs/indent/react'
import { KEYS } from 'platejs'

export const IndentKit = [
  IndentPlugin.configure({
    inject: {
      targetPlugins: [KEYS.p, KEYS.codeBlock],
    },
    options: {
      offset: 24,
    },
  }),
]
