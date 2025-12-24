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
      const isListType = [KEYS.ul, KEYS.ol, KEYS.listTodo].includes(type as any)

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

  const turnIntoItems = [
    { key: KEYS.p, icon: TypeIcon, label: 'Paragraph' },
    { key: KEYS.h1, icon: Heading1Icon, label: 'Heading 1' },
    { key: KEYS.h2, icon: Heading2Icon, label: 'Heading 2' },
    { key: KEYS.h3, icon: Heading3Icon, label: 'Heading 3' },
    { key: KEYS.blockquote, icon: Quote, label: 'Blockquote' },
    { key: KEYS.ul, icon: ListIcon, label: 'Bulleted list' },
    { key: KEYS.ol, icon: ListOrdered, label: 'Numbered list' },
    { key: KEYS.listTodo, icon: Square, label: 'Todo list' },
  ]

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
              {turnIntoItems.map(({ key, icon: Icon, label }) => (
                <ContextMenuItem key={key} onClick={() => handleTurnInto(key)}>
                  <Icon /> {label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
