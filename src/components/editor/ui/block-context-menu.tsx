import { AIChatPlugin } from '@platejs/ai/react'
import {
  BLOCK_CONTEXT_MENU_ID,
  BlockMenuPlugin,
  BlockSelectionPlugin,
} from '@platejs/selection/react'
import {
  CopyIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrdered,
  Quote,
  SparklesIcon,
  Square,
  Trash2Icon,
  TypeIcon,
} from 'lucide-react'
import { KEYS } from 'platejs'
import { useEditorPlugin, usePlateState } from 'platejs/react'
import { useCallback, useState } from 'react'
import { useIsTouchDevice } from '@/hooks/use-is-touch-device'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/ui/context-menu'

type Value = 'askAI' | null

export function BlockContextMenu({ children }: { children: React.ReactNode }) {
  const { api, editor } = useEditorPlugin(BlockMenuPlugin)
  const [value, setValue] = useState<Value>(null)
  const isTouch = useIsTouchDevice()
  const [readOnly] = usePlateState('readOnly')

  const handleTurnInto = useCallback(
    (type: string) => {
      const isListType =
        type === KEYS.ul || type === KEYS.ol || type === KEYS.listTodo

      editor.tf.withoutNormalizing(() => {
        for (const [node, path] of editor
          .getApi(BlockSelectionPlugin)
          .blockSelection.getNodes()) {
          if (node[KEYS.listType]) {
            editor.tf.unsetNodes([KEYS.listType, 'indent'], {
              at: path,
            })
          }

          if (isListType) {
            editor.tf.setNodes(
              {
                indent: 1,
                listStyleType: type,
                ...(type === KEYS.listTodo && { checked: false }),
              },
              { at: path }
            )
          } else {
            editor.tf.toggleBlock(type, { at: path })
          }
        }
      })
    },
    [editor]
  )

  if (isTouch) {
    return children
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open) {
          // prevent unselect the block selection
          setTimeout(() => {
            api.blockMenu.hide()
          }, 0)
        }
      }}
      modal={false}
    >
      <ContextMenuTrigger
        asChild
        onContextMenu={(event) => {
          const dataset = (event.target as HTMLElement).dataset
          const disabled =
            dataset?.slateEditor === 'true' ||
            readOnly ||
            dataset?.plateOpenContextMenu === 'false'

          if (disabled) return event.preventDefault()

          api.blockMenu.show(BLOCK_CONTEXT_MENU_ID, {
            x: event.clientX,
            y: event.clientY,
          })
        }}
      >
        <div>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-64"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          editor.getApi(BlockSelectionPlugin).blockSelection.focus()

          if (value === 'askAI') {
            editor.getApi(AIChatPlugin).aiChat.show()
          }

          setValue(null)
        }}
      >
        <ContextMenuGroup>
          <ContextMenuItem
            onClick={() => {
              setValue('askAI')
            }}
          >
            <SparklesIcon /> Ask AI
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              editor
                .getTransforms(BlockSelectionPlugin)
                .blockSelection.removeNodes()
              editor.tf.focus()
            }}
          >
            <Trash2Icon /> Delete
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              editor
                .getTransforms(BlockSelectionPlugin)
                .blockSelection.duplicate()
            }}
          >
            <CopyIcon /> Duplicate
            {/* <ContextMenuShortcut>⌘ + D</ContextMenuShortcut> */}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Turn into</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuItem onClick={() => handleTurnInto(KEYS.p)}>
                <TypeIcon /> Paragraph
              </ContextMenuItem>

              <ContextMenuItem onClick={() => handleTurnInto(KEYS.h1)}>
                <Heading1Icon /> Heading 1
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleTurnInto(KEYS.h2)}>
                <Heading2Icon /> Heading 2
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleTurnInto(KEYS.h3)}>
                <Heading3Icon /> Heading 3
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleTurnInto(KEYS.blockquote)}>
                <Quote /> Blockquote
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleTurnInto(KEYS.ul)}>
                <ListIcon /> Bulleted list
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleTurnInto(KEYS.ol)}>
                <ListOrdered /> Numbered list
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleTurnInto(KEYS.listTodo)}>
                <Square /> Todo list
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
