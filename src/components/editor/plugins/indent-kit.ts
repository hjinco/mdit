import { IndentPlugin } from '@platejs/indent/react'
import { KEYS } from 'platejs'

export const IndentKit = [
  IndentPlugin.configure({
    inject: {
      targetPlugins: [KEYS.p],
    },
    options: {
      offset: 24,
    },
    shortcuts: {
      backspace: {
        keys: 'backspace',
        handler: ({ editor }) => {
          // Check if cursor is at the start of the block
          if (!editor.api.isAt({ start: true })) {
            return false // Allow default behavior
          }

          // Get current block node
          const entry = editor.api.above({
            match: editor.api.isBlock,
            mode: 'highest',
          })

          if (!entry) {
            return false // Allow default behavior
          }

          const [node, path] = entry

          // Allow default behavior in codeblock
          if (node.type === editor.getType(KEYS.codeBlock)) {
            return false
          }

          // Check indent property
          const indent = (node as { indent?: number }).indent

          // Only process if indent exists and is greater than 0
          if (indent === undefined || indent === 0) {
            return false // Allow default behavior
          }

          // Check if it's a list block (has listStyleType)
          const listStyleType = (node as { listStyleType?: string })
            .listStyleType

          if (listStyleType) {
            // Convert list block to paragraph (keep indent)
            editor.tf.setNodes({ type: editor.getType(KEYS.p) }, { at: path })
            editor.tf.unsetNodes('listStyleType', { at: path })
            return true // Prevent default behavior
          }

          // If it's already a paragraph, outdent
          if (node.type === editor.getType(KEYS.p)) {
            const newIndent = indent - 1
            if (newIndent > 0) {
              editor.tf.setNodes({ indent: newIndent }, { at: path })
            } else {
              // Remove indent property if it becomes 0
              editor.tf.unsetNodes('indent', { at: path })
            }
            return true // Prevent default behavior
          }

          // Allow default behavior for other block types
          return false
        },
      },
      tab: {
        keys: 'tab',
        handler: ({ editor, event }) => {
          // Allow default behavior for Shift+Tab (outdent)
          if (event.shiftKey) {
            return false
          }

          // Get current block node
          const entry = editor.api.above({
            match: editor.api.isBlock,
            mode: 'highest',
          })

          if (!entry) {
            return false // Allow default behavior
          }

          const [node, path] = entry

          // Allow default behavior in codeblock
          if (node.type === editor.getType(KEYS.codeBlock)) {
            return false
          }

          // Find previous block node
          const previousEntry = editor.api.previous({
            at: path,
            match: editor.api.isBlock,
            mode: 'highest',
          })

          // Check previous block's indent value (0 if missing)
          const previousIndent =
            previousEntry && (previousEntry[0] as { indent?: number }).indent
              ? (previousEntry[0] as { indent?: number }).indent!
              : 0

          // Set current block's indent to (previous block indent + 1)
          const newIndent = previousIndent + 1

          if (newIndent > 0) {
            editor.tf.setNodes({ indent: newIndent }, { at: path })
          } else {
            editor.tf.unsetNodes('indent', { at: path })
          }

          return true // Prevent default behavior
        },
      },
    },
  }),
]
