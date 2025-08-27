import { AIChatPlugin } from '@platejs/ai/react'
import {
  useLinkToolbarButton,
  useLinkToolbarButtonState,
} from '@platejs/link/react'
import { insertInlineEquation } from '@platejs/math'
import {
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  KeyboardIcon,
  LinkIcon,
  MoreHorizontalIcon,
  RadicalIcon,
  StrikethroughIcon,
  SubscriptIcon,
  SuperscriptIcon,
  UnderlineIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { KEYS } from 'platejs'
import {
  useEditorPlugin,
  useEditorReadOnly,
  useEditorRef,
  useMarkToolbarButton,
  useMarkToolbarButtonState,
} from 'platejs/react'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { ToolbarButton, ToolbarGroup } from './toolbar'

export function FloatingToolbarButtons() {
  const editor = useEditorRef()
  const readOnly = useEditorReadOnly()
  const { api } = useEditorPlugin(AIChatPlugin)

  const state = useLinkToolbarButtonState()
  const { props: buttonProps } = useLinkToolbarButton(state)

  return (
    <>
      {!readOnly && (
        <>
          <ToolbarGroup>
            <ToolbarButton
              tooltip="AI commands"
              onClick={() => {
                api.aiChat.show()
              }}
              onMouseDown={(e) => {
                e.preventDefault()
              }}
            >
              <WandSparklesIcon />
              Ask AI
            </ToolbarButton>
          </ToolbarGroup>

          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
              <BoldIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
              <ItalicIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.underline}
              tooltip="Underline (⌘+U)"
            >
              <UnderlineIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              tooltip="Strikethrough (⌘+⇧+M)"
            >
              <StrikethroughIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.code} tooltip="Code (⌘+E)">
              <Code2Icon />
            </MarkToolbarButton>

            <ToolbarButton
              onClick={() => {
                insertInlineEquation(editor)
              }}
              tooltip="Mark as equation"
            >
              <RadicalIcon />
            </ToolbarButton>

            <ToolbarButton data-plate-focus tooltip="Link" {...buttonProps}>
              <LinkIcon />
            </ToolbarButton>
          </ToolbarGroup>
        </>
      )}

      <ToolbarGroup>{!readOnly && <MoreToolbarButton />}</ToolbarGroup>
    </>
  )
}

function MarkToolbarButton({
  clear,
  nodeType,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & {
  nodeType: string
  clear?: string[] | string
}) {
  const state = useMarkToolbarButtonState({ clear, nodeType })
  const { props: buttonProps } = useMarkToolbarButton(state)
  return <ToolbarButton {...props} {...buttonProps} />
}

export function MoreToolbarButton() {
  const editor = useEditorRef()
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Insert">
          <MoreHorizontalIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="ignore-click-outside/toolbar flex max-h-[500px] min-w-[180px] flex-col overflow-y-auto"
        align="start"
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              editor.tf.toggleMark(KEYS.kbd)
              editor.tf.collapse({ edge: 'end' })
              editor.tf.focus()
            }}
          >
            <KeyboardIcon />
            Keyboard input
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => {
              editor.tf.toggleMark(KEYS.sup, {
                remove: KEYS.sub,
              })
              editor.tf.focus()
            }}
          >
            <SuperscriptIcon />
            Superscript
            {/* (⌘+,) */}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              editor.tf.toggleMark(KEYS.sub, {
                remove: KEYS.sup,
              })
              editor.tf.focus()
            }}
          >
            <SubscriptIcon />
            Subscript
            {/* (⌘+.) */}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
