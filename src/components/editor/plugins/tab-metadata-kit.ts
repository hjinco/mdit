import { KEYS } from 'platejs'
import { createPlatePlugin } from 'platejs/react'
import { useTabStore } from '@/store/tab-store'

/**
 * Extract text content from a Slate node by traversing its children
 */
function extractTextFromNode(node: any): string {
  if (typeof node === 'string') {
    return node
  }
  if (node.text) {
    return node.text
  }
  if (Array.isArray(node.children)) {
    return node.children.map(extractTextFromNode).join('')
  }
  return ''
}

function isHeadingType(type: string) {
  return KEYS.heading.includes(type)
}

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  // Initialize first row
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  // Initialize first column
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

const TabMetadataPlugin = createPlatePlugin({
  key: 'tabMetadata',
  handlers: {
    onChange: ({ editor }) => {
      const blocks = editor.children
      const selection = editor.selection

      if (!blocks || blocks.length === 0) {
        return
      }

      const firstBlock = blocks[0]

      // Extract first heading if it exists and selection is in first block
      if (firstBlock && isHeadingType(firstBlock.type) && selection) {
        const focusBlock = editor.api.above({
          at: selection.focus,
          match: editor.api.isBlock,
          mode: 'highest',
        })

        if (focusBlock) {
          const [, focusPath] = focusBlock

          // Only update firstHeading if selection is within the first block
          if (focusPath.length === 1 && focusPath[0] === 0) {
            const firstHeading = extractTextFromNode(firstBlock)
            useTabStore.setState((prev) => {
              // This prevents overwriting tab name when user manually renamed file to match heading
              if (
                prev.tab &&
                levenshteinDistance(firstHeading, prev.tab.name) > 1
              ) {
                return prev
              }
              return {
                ...prev,
                tab: prev.tab ? { ...prev.tab, name: firstHeading } : undefined,
              }
            })
            return
          }
        }
      }
    },
  },
})

export const TabMetadataKit = [TabMetadataPlugin]
