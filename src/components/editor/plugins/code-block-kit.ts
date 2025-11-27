import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from '@platejs/code-block/react'
import { all, createLowlight } from 'lowlight'
import { KEYS, NodeApi, PointApi, type TCodeBlockElement } from 'platejs'
import type { PlateEditor } from 'platejs/react'

import {
  CodeBlockElement,
  CodeLineElement,
  CodeSyntaxLeaf,
} from '../ui/node-code-block'

const lowlight = createLowlight(all)

// Helper function to check if selection is inside a code block
function getCodeBlockEntry(editor: PlateEditor) {
  const selection = editor.selection
  if (!selection) return null

  return editor.api.above({
    at: selection,
    match: { type: editor.getType(KEYS.codeBlock) },
    mode: 'lowest',
  }) as [TCodeBlockElement, number[]] | undefined
}

export const CodeBlockKit = [
  CodeBlockPlugin.configure({
    node: { component: CodeBlockElement },
    options: { lowlight },
    shortcuts: {
      toggle: { keys: 'mod+alt+8' },
      selectAll: {
        keys: 'mod+a',
        priority: 100,
        handler: ({ editor }) => {
          const codeBlockEntry = getCodeBlockEntry(editor)
          if (!codeBlockEntry) return false

          const [, codeBlockPath] = codeBlockEntry

          const start = editor.api.start(codeBlockPath)
          const end = editor.api.end(codeBlockPath)
          if (start && end) {
            editor.tf.select({
              anchor: start,
              focus: end,
            })
            editor.tf.focus()
          }
          return true
        },
      },
      copy: {
        keys: 'mod+c',
        priority: 100,
        handler: ({ editor }) => {
          const codeBlockEntry = getCodeBlockEntry(editor)
          if (!codeBlockEntry) return false

          const [codeBlockElement] = codeBlockEntry

          // Get selected text from DOM selection
          const domSelection = window.getSelection()
          const selectedText = domSelection?.toString()

          if (selectedText) {
            // If there's a DOM selection, copy it
            navigator.clipboard.writeText(selectedText).catch(() => {
              // Ignore clipboard errors
            })
          } else {
            // If no selection, copy the entire code block
            const text = NodeApi.string(codeBlockElement)
            navigator.clipboard.writeText(text).catch(() => {
              // Ignore clipboard errors
            })
          }
          return true
        },
      },
      cut: {
        keys: 'mod+x',
        priority: 100,
        handler: ({ editor }) => {
          const codeBlockEntry = getCodeBlockEntry(editor)
          if (!codeBlockEntry) return false

          const [codeBlockElement, codeBlockPath] = codeBlockEntry

          // Get selected text from DOM selection
          const domSelection = window.getSelection()
          const selectedText = domSelection?.toString()

          if (selectedText) {
            // If there's a DOM selection, cut it
            navigator.clipboard
              .writeText(selectedText)
              .then(() => {
                // Delete the selected fragment using editor API
                const currentSelection = editor.selection
                if (
                  currentSelection &&
                  !PointApi.equals(
                    currentSelection.anchor,
                    currentSelection.focus
                  )
                ) {
                  editor.tf.deleteFragment()
                }
              })
              .catch(() => {
                // Ignore clipboard errors, but still delete
                const currentSelection = editor.selection
                if (
                  currentSelection &&
                  !PointApi.equals(
                    currentSelection.anchor,
                    currentSelection.focus
                  )
                ) {
                  editor.tf.deleteFragment()
                }
              })
          } else {
            // If no selection, cut the entire code block
            const text = NodeApi.string(codeBlockElement)
            navigator.clipboard
              .writeText(text)
              .then(() => {
                editor.tf.removeNodes({ at: codeBlockPath })
              })
              .catch(() => {
                // Ignore clipboard errors, but still remove
                editor.tf.removeNodes({ at: codeBlockPath })
              })
          }
          return true
        },
      },
      tab: {
        keys: 'tab',
        priority: 100,
        handler: ({ editor, event }) => {
          const codeBlockEntry = getCodeBlockEntry(editor)
          if (!codeBlockEntry) return false

          // Allow default behavior for Shift+Tab (outdent)
          if (event.shiftKey) {
            return false
          }

          // Insert tab character in code block
          editor.tf.insertText('\t')
          return true
        },
      },
    },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
]
