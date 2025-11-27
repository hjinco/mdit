import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from '@platejs/code-block/react'
import { all, createLowlight } from 'lowlight'
import {
  KEYS,
  NodeApi,
  PathApi,
  PointApi,
  type TCodeBlockElement,
} from 'platejs'
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

// Helper function to get current code line entry
function getCodeLineEntry(editor: PlateEditor) {
  const selection = editor.selection
  if (!selection) return null

  return editor.api.above({
    at: selection,
    match: { type: editor.getType(KEYS.codeLine) },
    mode: 'lowest',
  }) as [any, number[]] | undefined
}

// Helper function to calculate indentation depth from line text
function getIndentDepth(lineText: string): number {
  let depth = 0
  for (const char of lineText) {
    if (char === '\t') {
      depth++
    } else if (char === ' ') {
      // Count spaces as indentation too
      depth++
    } else {
      // Stop counting when we hit a non-whitespace character
      break
    }
  }
  return depth
}

// Insert a code line starting with indentation
function insertCodeLine(editor: PlateEditor, indentDepth = 0) {
  if (editor.selection) {
    const indent = '\t'.repeat(indentDepth)
    const codeLinePath = editor.selection.focus.path.slice(0, -1)
    const nextPath = PathApi.next(codeLinePath)

    editor.tf.insertNodes(
      {
        children: [{ text: indent }],
        type: editor.getType(KEYS.codeLine),
      },
      { at: nextPath }
    )

    // Move cursor to after the indentation (start of text)
    const newLineStart = editor.api.start(nextPath)
    if (newLineStart) {
      editor.tf.select({
        anchor: { ...newLineStart, offset: indentDepth },
        focus: { ...newLineStart, offset: indentDepth },
      })
      editor.tf.focus()
    }
  }
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
        handler: ({ editor }) => {
          const codeBlockEntry = getCodeBlockEntry(editor)
          if (!codeBlockEntry) return false

          // Insert tab character in code block
          editor.tf.insertText('\t')
          return true
        },
      },
      shiftTab: {
        keys: 'shift+tab',
        priority: 100,
        handler: ({ editor }) => {
          const codeLineEntry = getCodeLineEntry(editor)
          if (!codeLineEntry) return false

          const [codeLineNode, codeLinePath] = codeLineEntry
          const lineText = NodeApi.string(codeLineNode)

          if (lineText.startsWith('\t')) {
            // Check if line starts with tab character
            const start = editor.api.start(codeLinePath)
            if (start) {
              // Delete the first tab character
              const after = editor.api.after(start)
              if (after) {
                editor.tf.delete({
                  at: {
                    anchor: start,
                    focus: after,
                  },
                })
              } else {
                // Fallback: delete one character from start
                editor.tf.delete({
                  at: start,
                  unit: 'character',
                  distance: 1,
                })
              }
            }
          }
          return true
        },
      },
      enter: {
        keys: 'enter',
        priority: 100,
        handler: ({ editor }) => {
          const codeBlockEntry = getCodeBlockEntry(editor)
          if (!codeBlockEntry) return false

          const codeLineEntry = getCodeLineEntry(editor)
          if (!codeLineEntry) return false

          const [codeLineNode, codeLinePath] = codeLineEntry
          const selection = editor.selection
          if (!selection) return false

          // Check if cursor is at the end of the code line
          const isAtEnd = editor.api.isAt({ end: true, at: codeLinePath })

          if (isAtEnd) {
            // At end of line: insert new line with indentation
            const lineText = NodeApi.string(codeLineNode)
            const indentDepth = getIndentDepth(lineText)
            insertCodeLine(editor, indentDepth)
            return true
          }

          // In middle of line: manually handle the split with proper indentation
          const lineText = NodeApi.string(codeLineNode)
          const indentDepth = getIndentDepth(lineText)
          const indent = '\t'.repeat(indentDepth)

          // Get the end of the code line
          const lineEnd = editor.api.end(codeLinePath)
          if (!lineEnd) return false

          // Temporarily select from cursor to end of line to get the text
          const originalSelection = editor.selection
          editor.tf.select({
            anchor: selection.focus,
            focus: lineEnd,
          })
          const fragment = editor.api.fragment()
          const textAfter = fragment
            ? fragment.map((node) => NodeApi.string(node)).join('')
            : ''

          // Restore original selection
          if (originalSelection) {
            editor.tf.select(originalSelection)
          }

          // Update current line: delete everything from cursor to end of line, then insert new line
          editor.tf.withoutNormalizing(() => {
            editor.tf.delete({
              at: {
                anchor: selection.focus,
                focus: lineEnd,
              },
            })

            // Calculate the path for the new line
            const codeLinePath = selection.focus.path.slice(0, -1)
            const nextPath = PathApi.next(codeLinePath)

            // Insert new line with indentation and text after cursor
            editor.tf.insertNodes(
              {
                children: [{ text: indent + textAfter }],
                type: editor.getType(KEYS.codeLine),
              },
              { at: nextPath }
            )

            // Move cursor to after the indentation (start of text content)
            const newLineStart = editor.api.start(nextPath)
            if (newLineStart) {
              editor.tf.select({
                anchor: { ...newLineStart, offset: indentDepth },
                focus: { ...newLineStart, offset: indentDepth },
              })
              editor.tf.focus()
            }
          })

          return true
        },
      },
    },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
]
