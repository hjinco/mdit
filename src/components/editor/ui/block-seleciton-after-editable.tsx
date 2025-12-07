import { MarkdownPlugin } from '@platejs/markdown'
import {
  type BlockSelectionConfig,
  BlockSelectionPlugin,
  selectInsertedBlocks,
  useSelectionArea,
} from '@platejs/selection/react'
import { isHotkey, KEYS, PathApi } from 'platejs'
import {
  type EditableSiblingComponent,
  useEditorPlugin,
  useEditorRef,
  usePluginOption,
} from 'platejs/react'
import React from 'react'
import ReactDOM from 'react-dom'

function decodeHtmlEntities(html: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = html
  return textarea.value
}

export const BlockSelectionAfterEditable: EditableSiblingComponent = () => {
  const editor = useEditorRef()
  const { api, getOption, getOptions, setOption } =
    useEditorPlugin<BlockSelectionConfig>({ key: KEYS.blockSelection })

  const isSelectingSome = usePluginOption(
    BlockSelectionPlugin,
    'isSelectingSome'
  )
  const selectedIds = usePluginOption(BlockSelectionPlugin, 'selectedIds')

  const removeSelectedBlocks = React.useCallback(
    (options: { selectPrevious?: boolean } = {}) => {
      const entries = [
        ...editor.api.nodes({
          at: [],
          match: (n) => !!n.id && selectedIds?.has(n.id as string),
        }),
      ]

      if (entries.length === 0) return null

      const firstPath = entries[0]![1]

      editor.tf.withoutNormalizing(() => {
        for (const [node, path] of [...entries].reverse()) {
          editor.tf.removeNodes({
            at: path,
          })
          api.blockSelection.delete(node.id as string)
        }

        if (editor.children.length === 0) {
          editor.meta._forceFocus = true
          editor.tf.focus()
          editor.meta._forceFocus = false
        } else if (options.selectPrevious) {
          const prevPath = PathApi.previous(firstPath)

          if (prevPath) {
            const prevEntry = editor.api.block({ at: prevPath })

            if (prevEntry) {
              setOption('selectedIds', new Set([prevEntry[0].id as string]))
            }
          }
        }
      })

      return firstPath
    },
    [editor, api.blockSelection, selectedIds, setOption]
  )

  const moveBlockUp = React.useCallback(() => {
    const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
    const selectedBlocks = blockSelectionApi.blockSelection.getNodes()

    if (selectedBlocks.length === 0) return

    const firstPath = selectedBlocks[0][1]

    // Check if we can move up
    if (firstPath.at(-1) === 0) return // Already at the top

    // Move all selected blocks up
    for (const [, path] of selectedBlocks) {
      const targetPath = [...path]
      targetPath[targetPath.length - 1] -= 1

      editor.tf.moveNodes({
        at: path,
        to: targetPath,
      })
    }
  }, [editor])

  const moveBlockDown = React.useCallback(() => {
    const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
    const selectedBlocks = blockSelectionApi.blockSelection.getNodes()

    if (selectedBlocks.length === 0) return

    const lastPath = selectedBlocks.at(-1)?.[1]
    if (!lastPath) return

    // Get the parent to check bounds
    const parent = editor.api.parent(lastPath)
    if (!parent) return

    const [parentNode] = parent
    if (!('children' in parentNode)) return

    const lastIndex = lastPath.at(-1) as number
    const childrenLength = (parentNode.children as any[]).length

    // Check if we can move down
    if (lastIndex >= childrenLength - 1) return // Already at the bottom

    // Move all selected blocks down (in reverse order to maintain positions)
    for (let i = selectedBlocks.length - 1; i >= 0; i--) {
      const [, path] = selectedBlocks[i]
      const targetPath = [...path]
      targetPath[targetPath.length - 1] += 1

      editor.tf.moveNodes({
        at: path,
        to: targetPath,
      })
    }
  }, [editor])

  useSelectionArea()

  const inputRef = React.useRef<HTMLInputElement>(null)
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
    setOption('shadowInputRef', inputRef)

    return () => {
      setIsMounted(false)
    }
  }, [setOption])

  React.useEffect(() => {
    if (!isSelectingSome) {
      setOption('anchorId', null)
    }
  }, [isSelectingSome, setOption])

  React.useEffect(() => {
    if (isSelectingSome && inputRef.current) {
      inputRef.current.focus({ preventScroll: true })
    } else if (inputRef.current) {
      inputRef.current.blur()
    }
  }, [isSelectingSome])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const isReadonly = editor.api.isReadOnly()
      getOptions().onKeyDownSelecting?.(editor, e.nativeEvent)

      if (!getOption('isSelectingSome')) return
      if (isHotkey('shift+up')(e)) {
        e.preventDefault()
        e.stopPropagation()
        api.blockSelection.shiftSelection('up')

        return
      }
      if (isHotkey('shift+down')(e)) {
        e.preventDefault()
        e.stopPropagation()
        api.blockSelection.shiftSelection('down')

        return
      }
      // ESC => unselect all
      if (isHotkey('escape')(e)) {
        api.blockSelection.deselect()

        return
      }
      // Undo/redo
      if (isHotkey('mod+z')(e)) {
        editor.undo()
        selectInsertedBlocks(editor)

        return
      }
      if (isHotkey('mod+a')(e)) {
        api.blockSelection.selectAll()

        return
      }

      if (isHotkey('mod+shift+z')(e)) {
        editor.redo()
        selectInsertedBlocks(editor)

        return
      }
      // Mod+D => duplicate selected blocks
      if (isHotkey('mod+d')(e)) {
        e.preventDefault()
        editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate()
        return
      }
      // Only continue if we have "some" selection
      if (!getOption('isSelectingSome')) return
      // Enter => focus first selected block
      if (isHotkey('enter')(e)) {
        const entry = editor.api.node({
          at: [],
          block: true,
          match: (n) => !!n.id && selectedIds?.has(n.id as string),
        })

        if (entry) {
          const [, path] = entry
          editor.meta._forceFocus = true
          editor.tf.focus({ at: path, edge: 'end' })
          editor.meta._forceFocus = undefined
          e.preventDefault()
        }

        return
      }
      // Backspace/Delete => remove selected blocks
      if (isHotkey(['backspace', 'delete'])(e) && !isReadonly) {
        e.preventDefault()
        removeSelectedBlocks({
          selectPrevious: isHotkey('backspace')(e),
        })
        return
      }
      // If SHIFT not pressed => arrow up/down sets new anchor
      if (isHotkey('up')(e)) {
        e.preventDefault()
        e.stopPropagation()
        api.blockSelection.moveSelection('up')

        return
      }
      if (isHotkey('down')(e)) {
        e.preventDefault()
        e.stopPropagation()
        api.blockSelection.moveSelection('down')

        return
      }
      // Alt+ArrowUp => move selected blocks up
      if (isHotkey('alt+arrowup')(e)) {
        e.preventDefault()
        e.stopPropagation()
        moveBlockUp()
        return
      }
      // Alt+ArrowDown => move selected blocks down
      if (isHotkey('alt+arrowdown')(e)) {
        e.preventDefault()
        e.stopPropagation()
        moveBlockDown()
        return
      }

      // Handle character input - remove selected blocks and insert character
      if (
        !isReadonly &&
        e.key.length === 1 && // Only handle single character keys
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault()
        const firstPath = removeSelectedBlocks()

        if (firstPath) {
          editor.meta._forceFocus = true
          editor.tf.insertNodes(
            editor.api.create.block({ children: [{ text: e.key }] }),
            { at: firstPath }
          )
          editor.tf.select(firstPath, { edge: 'end' })
          editor.meta._forceFocus = false
          editor.tf.focus()
        }
        return
      }
    },
    [
      editor,
      getOptions,
      getOption,
      api.blockSelection,
      removeSelectedBlocks,
      selectedIds,
      moveBlockUp,
      moveBlockDown,
    ]
  )

  /** Handle copy / cut / paste in block selection */
  const handleCopy = React.useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()

      if (getOption('isSelectingSome')) {
        const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
        const selectedBlocks = blockSelectionApi.blockSelection.getNodes()

        if (selectedBlocks.length > 0) {
          const nodes = selectedBlocks.map(([node]) => node)
          const markdown = editor
            .getApi(MarkdownPlugin)
            .markdown.serialize({ value: nodes as any })

          const decoded = decodeHtmlEntities(markdown)
          navigator.clipboard.writeText(decoded)
        }
      }
    },
    [editor, getOption]
  )

  const handleCut = React.useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()

      if (getOption('isSelectingSome')) {
        const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
        const selectedBlocks = blockSelectionApi.blockSelection.getNodes()

        if (selectedBlocks.length > 0) {
          const nodes = selectedBlocks.map(([node]) => node)
          const markdown = editor
            .getApi(MarkdownPlugin)
            .markdown.serialize({ value: nodes as any })

          const decoded = decodeHtmlEntities(markdown)
          navigator.clipboard.writeText(decoded)

          if (!editor.api.isReadOnly()) {
            editor
              .getTransforms(BlockSelectionPlugin)
              .blockSelection.removeNodes()
          }
        }
      }
    },
    [editor, getOption]
  )

  const handlePaste = React.useCallback(
    async (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()

      if (!editor.api.isReadOnly()) {
        const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
        if (blockSelectionApi.blockSelection.getNodes().length === 0) return

        let markdown = ''

        if (e.clipboardData) {
          try {
            markdown = e.clipboardData.getData('text/plain')
          } catch {
            markdown = ''
          }
        }

        if (!markdown && navigator.clipboard?.readText) {
          try {
            markdown = await navigator.clipboard.readText()
          } catch {
            markdown = ''
          }
        }

        if (!markdown) return

        const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n')
        const markdownApi = editor.getApi(MarkdownPlugin).markdown

        let fragment: any[]
        try {
          fragment = markdownApi.deserialize(normalizedMarkdown) as any[]
        } catch {
          return
        }

        if (!Array.isArray(fragment) || fragment.length === 0) return

        const firstPath = removeSelectedBlocks()

        if (firstPath) {
          editor.tf.insertNodes(fragment, { at: firstPath })
          editor.tf.select(firstPath, { edge: 'end' })
          editor.tf.focus()
        }
      }
    },
    [editor, removeSelectedBlocks]
  )

  if (!isMounted || typeof window === 'undefined') {
    return null
  }

  return ReactDOM.createPortal(
    <input
      ref={inputRef}
      className="slate-shadow-input"
      style={{
        left: '-300px',
        opacity: 0,
        position: 'fixed',
        top: '-300px',
        zIndex: 999,
      }}
      onCopy={handleCopy}
      onCut={handleCut}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />,
    document.body
  )
}
