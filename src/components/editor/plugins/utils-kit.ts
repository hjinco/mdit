import { ExitBreakPlugin } from 'platejs'

export const UtilsKit = [
  ExitBreakPlugin.configure({
    shortcuts: {
      insert: { keys: 'mod+enter' },
      insertBefore: { keys: 'mod+shift+enter' },
    },
  }),
]
