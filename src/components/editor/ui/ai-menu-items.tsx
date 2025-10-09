import { AIChatPlugin } from '@platejs/ai/react'
import { useIsSelecting } from '@platejs/selection/react'
import {
  Album,
  Check,
  CommandIcon,
  CornerUpLeft,
  FeatherIcon,
  ListMinus,
  ListPlus,
  PenLine,
  PlusIcon,
  Trash2Icon,
  Wand,
  X,
} from 'lucide-react'
import { NodeApi } from 'platejs'
import { type PlateEditor, useEditorRef, usePluginOption } from 'platejs/react'
import { useEffect, useMemo } from 'react'
import { CommandGroup, CommandItem } from '@/ui/command'
import type { Command } from '../hooks/use-ai-commands'

type EditorChatState = 'cursorCommand' | 'cursorSuggestion' | 'selectionCommand'

const aiChatItems = {
  accept: {
    icon: <Check />,
    label: 'Accept',
    value: 'accept',
    onSelect: () => {
      // handled in the onAccept prop
      return
    },
  },
  continueWrite: {
    icon: <PenLine />,
    label: 'Continue writing',
    value: 'continueWrite',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      const ancestorNode = editor.api.block({ highest: true })

      if (!ancestorNode) return

      const isEmpty = NodeApi.string(ancestorNode[0]).trim().length === 0

      editor.getApi(AIChatPlugin).aiChat.submit({
        mode: 'insert',
        prompt: isEmpty
          ? `<Document>
{editor}
</Document>
Start writing a new paragraph AFTER <Document> ONLY ONE SENTENCE`
          : 'Continue writing AFTER <Block> ONLY ONE SENTENCE. DONT REPEAT THE TEXT.',
      })
    },
  },
  discard: {
    icon: <X />,
    label: 'Discard',
    shortcut: 'Escape',
    value: 'discard',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.tf.withoutNormalizing(() => {
        editor.tf.unsetNodes(['diff', 'diffOperation'], {
          at: [],
          match: (n) =>
            n.diff === true &&
            (n.diffOperation as { type: string })?.type === 'delete',
          mode: 'lowest',
        })

        editor.tf.removeNodes({
          match: (n) => n.diff === true,
          at: [],
          mode: 'lowest',
        })

        editor.getApi(AIChatPlugin).aiChat.hide()
      })
    },
  },
  fixSpelling: {
    icon: <Check />,
    label: 'Fix spelling & grammar',
    value: 'fixSpelling',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Fix spelling and grammar',
      })
    },
  },
  improveWriting: {
    icon: <Wand />,
    label: 'Improve writing',
    value: 'improveWriting',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Improve the writing',
      })
    },
  },
  makeLonger: {
    icon: <ListPlus />,
    label: 'Make longer',
    value: 'makeLonger',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Make longer',
      })
    },
  },
  makeShorter: {
    icon: <ListMinus />,
    label: 'Make shorter',
    value: 'makeShorter',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Make shorter',
      })
    },
  },
  simplifyLanguage: {
    icon: <FeatherIcon />,
    label: 'Simplify language',
    value: 'simplifyLanguage',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Simplify the language',
      })
    },
  },
  summarize: {
    icon: <Album />,
    label: 'Add a summary',
    value: 'summarize',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        mode: 'insert',
        prompt: {
          default: 'Summarize {editor}',
          selecting: 'Summarize',
        },
      })
    },
  },
  tryAgain: {
    icon: <CornerUpLeft />,
    label: 'Try again',
    value: 'tryAgain',
    onSelect: ({ editor }: { editor: PlateEditor }) => {
      editor.getApi(AIChatPlugin).aiChat.reload()
    },
  },
} satisfies Record<
  string,
  {
    icon: React.ReactNode
    label: string
    value: string
    component?: React.ComponentType<{ menuState: EditorChatState }>
    filterItems?: boolean
    items?: { label: string; value: string }[]
    shortcut?: string
    onSelect?: ({ editor }: { editor: PlateEditor }) => void
  }
>

const menuStateItems: Record<
  EditorChatState,
  {
    items: (typeof aiChatItems)[keyof typeof aiChatItems][]
    heading?: string
  }[]
> = {
  cursorCommand: [
    {
      items: [aiChatItems.continueWrite, aiChatItems.summarize],
    },
  ],
  cursorSuggestion: [
    {
      items: [aiChatItems.accept, aiChatItems.discard, aiChatItems.tryAgain],
    },
  ],
  selectionCommand: [
    {
      items: [
        aiChatItems.improveWriting,
        aiChatItems.fixSpelling,
        aiChatItems.makeLonger,
        aiChatItems.makeShorter,
        aiChatItems.simplifyLanguage,
      ],
    },
  ],
}

export interface AIMenuItemsProps {
  commands: Command[]
  setValue: (value: string) => void
  onAccept: () => void
  disabled: boolean
  onAddCommandOpen: () => void
  onCommandRemove: (type: 'selectionCommand', label: string) => void
}

export function AIMenuItems({
  commands,
  setValue,
  onAccept,
  disabled,
  onAddCommandOpen,
  onCommandRemove,
}: AIMenuItemsProps) {
  const editor = useEditorRef()
  const chat = usePluginOption(AIChatPlugin, 'chat')
  const messages = chat?.messages
  const status = chat?.status
  const isSelecting = useIsSelecting()

  const hasAssistantSuggestion = useMemo(() => {
    if (!messages || status === 'error') return false

    return messages.some((message: { role: string; content?: unknown }) => {
      if (message.role !== 'assistant') return false
      const content = message.content
      if (typeof content === 'string') {
        return content.trim().length > 0
      }
      if (Array.isArray(content)) {
        return content.length > 0
      }
      return Boolean(content)
    })
  }, [messages, status])

  const menuState = useMemo(() => {
    if (hasAssistantSuggestion) {
      return 'cursorSuggestion'
    }

    return isSelecting ? 'selectionCommand' : 'cursorCommand'
  }, [hasAssistantSuggestion, isSelecting])

  const menuGroups = useMemo(() => {
    const items = menuStateItems[menuState]

    return items
  }, [menuState])

  const handleMenuItemSelect = (
    menuItem: (typeof aiChatItems)[keyof typeof aiChatItems]
  ) => {
    if (menuItem.value === 'accept') {
      onAccept()
    } else {
      menuItem.onSelect?.({ editor })
    }
  }

  useEffect(() => {
    if (menuGroups.length > 0 && menuGroups[0].items.length > 0) {
      setValue(menuGroups[0].items[0].value)
    }
  }, [menuGroups, setValue])

  return (
    <>
      {menuGroups.map((group, index) => (
        <CommandGroup heading={group.heading} key={index}>
          {group.items.map((menuItem) => (
            <CommandItem
              className="[&_svg]:text-muted-foreground"
              key={menuItem.value}
              onSelect={() => {
                handleMenuItemSelect(menuItem)
              }}
              value={menuItem.value}
              disabled={disabled}
            >
              {menuItem.icon}
              <span>{menuItem.label}</span>
            </CommandItem>
          ))}
          {menuState === 'selectionCommand' &&
            commands.map((command) => (
              <CommandItem
                className="group"
                key={command.label}
                onSelect={() => {
                  editor.getApi(AIChatPlugin).aiChat.submit({
                    prompt: command.prompt,
                  })
                }}
                value={command.label}
                disabled={disabled}
              >
                <CommandIcon className="text-muted-foreground" />
                <span>{command.label}</span>
                <button
                  type="button"
                  className="ml-auto size-5 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 group/item"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCommandRemove('selectionCommand', command.label)
                  }}
                >
                  <Trash2Icon className="size-3.5 text-muted-foreground group-hover/item:text-destructive/80" />
                </button>
              </CommandItem>
            ))}
          {menuState === 'selectionCommand' && (
            <CommandItem
              className="[&_svg]:text-muted-foreground"
              key="addCommand"
              onSelect={onAddCommandOpen}
              value="addCommand"
              disabled={disabled}
            >
              <PlusIcon />
              <span>Add command</span>
            </CommandItem>
          )}
        </CommandGroup>
      ))}
    </>
  )
}
