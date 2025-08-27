import { ExitBreakPlugin, TrailingBlockPlugin } from 'platejs'

export const UtilsKit = [
  ExitBreakPlugin.configure({
    shortcuts: {
      insert: { keys: 'mod+enter' },
      insertBefore: { keys: 'mod+shift+enter' },
    },
  }),
  TrailingBlockPlugin.configure({
    options: {
      type: 'p',
      exclude: ['blockquote'],
    },
  }),
]
