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
        handler: ({ editor, event }) => {
          // Allow default behavior during IME composition
          if (event.isComposing) {
            return false
          }

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
            // Convert list block to paragraph
            editor.tf.setNodes(
              {
                type: editor.getType(KEYS.p),
                indent: indent > 1 ? indent - 1 : undefined,
                checked: indent === 1 ? undefined : node.checked,
              },
              { at: path }
            )
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
          // Get current block node
          const entry = editor.api.above({
            match: editor.api.isBlock,
            mode: 'highest',
          })

          if (!entry) {
            return
          }

          const [node, path] = entry

          // Allow default behavior in codeblock
          if (node.type === editor.getType(KEYS.codeBlock)) {
            return
          }

          // Check current block's indent value (0 if missing)
          const currentIndent = (node as { indent?: number }).indent ?? 0

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

          // If current indent is smaller than previous, increment current indent by 1
          // Otherwise, set to previous indent + 1
          const newIndent =
            currentIndent < previousIndent
              ? currentIndent + 1
              : previousIndent + 1

          editor.tf.setNodes({ indent: newIndent }, { at: path })

          event.preventDefault()
        },
      },
      shiftTab: {
        keys: 'shift+tab',
        handler: ({ editor, event }) => {
          const entry = editor.api.above({
            match: editor.api.isBlock,
            mode: 'highest',
          })

          if (!entry) {
            return
          }

          const [node, path] = entry

          if (node.type === editor.getType(KEYS.codeBlock)) {
            return
          }

          const currentIndent = (node as { indent?: number }).indent ?? 0

          if (currentIndent <= 1) {
            return
          }

          // Collect all child blocks that need to be outdented
          const childBlocks: Array<{ path: typeof path; newIndent: number }> =
            []
          let currentPath = path

          while (true) {
            const nextEntry = editor.api.next({
              at: currentPath,
              match: editor.api.isBlock,
              mode: 'highest',
            })

            if (!nextEntry) {
              break
            }

            const [nextNode, nextPath] = nextEntry
            const nextIndent = (nextNode as { indent?: number }).indent ?? 0

            // If next block's indent is less than or equal to current block's indent,
            // it's not a child, so stop
            if (nextIndent <= currentIndent) {
              break
            }

            // This is a child block, collect it for outdenting
            const childNewIndent = nextIndent - 1
            childBlocks.push({ path: nextPath, newIndent: childNewIndent })

            currentPath = nextPath
          }

          // Perform all updates in a single normalization
          editor.tf.withoutNormalizing(() => {
            // Outdent current block
            editor.tf.setNodes({ indent: currentIndent - 1 }, { at: path })

            // Outdent all child blocks
            for (const {
              path: childPath,
              newIndent: childNewIndent,
            } of childBlocks) {
              editor.tf.setNodes({ indent: childNewIndent }, { at: childPath })
            }
          })

          event.preventDefault()
        },
      },
    },
  }),
]
