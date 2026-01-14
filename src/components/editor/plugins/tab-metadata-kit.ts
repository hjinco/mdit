import { KEYS } from 'platejs'
import { createPlatePlugin } from 'platejs/react'
import { useStore } from '@/store'
import { sanitizeFilename } from '@/utils/path-utils'

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

const TabMetadataPlugin = createPlatePlugin({
  key: 'tabMetadata',
  handlers: {
    onChange: ({ editor }) => {
      // editor only mode
      if (!useStore.getState().workspacePath) {
        return
      }

      const { tab, linkedTab, updateLinkedName } = useStore.getState()

      const isLinkedToCurrentTab =
        tab && linkedTab && linkedTab.path === tab.path

      if (!isLinkedToCurrentTab) {
        return
      }

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
            const firstHeading = sanitizeFilename(
              extractTextFromNode(firstBlock)
            )
            updateLinkedName(firstHeading)
            return
          }
        }
      }
    },
  },
})

export const TabMetadataKit = [TabMetadataPlugin]
