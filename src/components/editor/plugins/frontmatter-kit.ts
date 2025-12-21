import { PointApi } from 'platejs'
import { createPlatePlugin } from 'platejs/react'
import { memo } from 'react'
import { useEditorStore } from '@/store/editor-store'
import { FrontmatterElement } from '../ui/node-frontmatter'

export const FRONTMATTER_KEY = 'frontmatter'

export const frontmatterPlugin = createPlatePlugin({
  key: FRONTMATTER_KEY,
  node: {
    component: memo(FrontmatterElement, () => true),
    isElement: true,
    isVoid: true,
  },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.defaultPrevented) return
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowLeft') return

      const selection = editor.selection
      if (!selection) return

      if (!editor.api.isCollapsed()) return

      const blockEntry = editor.api.block()
      if (!blockEntry) return
      const [, path] = blockEntry
      if (path.length !== 1 || path[0] !== 1) return

      const start = editor.api.start(path)
      if (!start) return
      if (
        !PointApi.equals(selection.anchor, start) ||
        !PointApi.equals(selection.focus, start)
      )
        return

      const firstNode = editor.children[0] as { type?: string } | undefined
      if (!firstNode || firstNode.type !== FRONTMATTER_KEY) return

      event.preventDefault()
      event.stopPropagation()
      useEditorStore.getState().setFrontmatterFocusTarget('addButton')
    },
  },
})

export const FrontmatterKit = [frontmatterPlugin]
