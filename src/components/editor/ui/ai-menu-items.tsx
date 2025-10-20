import { AIChatPlugin, AIPlugin } from '@platejs/ai/react'
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
import { type PlateEditor, useEditorRef } from 'platejs/react'
import { useEffect, useMemo, useState } from 'react'
import { CommandGroup, CommandItem } from '@/ui/command'
import type { Command } from '../hooks/use-ai-commands'

type EditorChatState = 'cursorCommand' | 'cursorSuggestion' | 'selectionCommand'

const HIDDEN_DEFAULT_COMMANDS_KEY = 'ai-hidden-default-selection-commands'

const aiChatItems = {
  accept: {
    icon: <Check />,
    label: 'Accept',
    value: 'accept',
    onSelect: ({ editor }) => {
      editor.getTransforms(AIChatPlugin).aiChat.accept()
      editor.tf.focus({ edge: 'end' })
    },
  },
  continueWrite: {
    icon: <PenLine />,
    label: 'Continue writing',
    value: 'continueWrite',
    onSelect: ({ editor, input }) => {
      const ancestorNode = editor.api.block({ highest: true })

      if (!ancestorNode) return

      const isEmpty = NodeApi.string(ancestorNode[0]).trim().length === 0

      editor.getApi(AIChatPlugin).aiChat.submit(input, {
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
    onSelect: ({ editor }) => {
      editor.getTransforms(AIPlugin).ai.undo()
      editor.getApi(AIChatPlugin).aiChat.hide()
    },
  },
  fixSpelling: {
    icon: <Check />,
    label: 'Fix spelling & grammar',
    value: 'fixSpelling',
    onSelect: ({ editor, input }) => {
      editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt: 'Fix spelling and grammar',
        toolName: 'edit',
      })
    },
  },
  improveWriting: {
    icon: <Wand />,
    label: 'Improve writing',
    value: 'improveWriting',
    onSelect: ({ editor, input }) => {
      editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt: 'Improve the writing',
        toolName: 'edit',
      })
    },
  },
  makeLonger: {
    icon: <ListPlus />,
    label: 'Make longer',
    value: 'makeLonger',
    onSelect: ({ editor, input }) => {
      editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt: 'Make longer',
        toolName: 'edit',
      })
    },
  },
  makeShorter: {
    icon: <ListMinus />,
    label: 'Make shorter',
    value: 'makeShorter',
    onSelect: ({ editor, input }) => {
      editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt: 'Make shorter',
        toolName: 'edit',
      })
    },
  },
  simplifyLanguage: {
    icon: <FeatherIcon />,
    label: 'Simplify language',
    value: 'simplifyLanguage',
    onSelect: ({ editor, input }) => {
      editor.getApi(AIChatPlugin).aiChat.submit(input, {
        prompt: 'Simplify the language',
        toolName: 'edit',
      })
    },
  },
  summarize: {
    icon: <Album />,
    label: 'Add a summary',
    value: 'summarize',
    onSelect: ({ editor, input }) => {
      editor.getApi(AIChatPlugin).aiChat.submit(input, {
        mode: 'insert',
        prompt: {
          default: 'Summarize {editor}',
          selecting: 'Summarize',
        },
        toolName: 'generate',
      })
    },
  },
  tryAgain: {
    icon: <CornerUpLeft />,
    label: 'Try again',
    value: 'tryAgain',
    onSelect: ({ editor }) => {
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
    onSelect: ({
      editor,
      input,
    }: {
      editor: PlateEditor
      input: string
    }) => void
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
  input: string
  setInput: (value: string) => void
  setValue: (value: string) => void
  disabled: boolean
  menuState: EditorChatState
  onAddCommandOpen: () => void
  onCommandRemove: (type: 'selectionCommand', label: string) => void
}

export function AIMenuItems({
  commands,
  input,
  setInput,
  setValue,
  disabled,
  menuState,
  onAddCommandOpen,
  onCommandRemove,
}: AIMenuItemsProps) {
  const editor = useEditorRef()
  const [hiddenDefaultLabels, setHiddenDefaultLabels] = useState<string[]>(
    () => {
      const stored = localStorage.getItem(HIDDEN_DEFAULT_COMMANDS_KEY)
      if (!stored) return []
      try {
        const parsed = JSON.parse(stored)
        if (!Array.isArray(parsed)) return []
        return parsed.filter((item) => typeof item === 'string')
      } catch {
        return []
      }
    }
  )

  const menuGroups = useMemo(() => {
    return menuStateItems[menuState]
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !hiddenDefaultLabels.includes(item.label)
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [hiddenDefaultLabels, menuState])

  const hideDefaultCommand = (label: string) => {
    setHiddenDefaultLabels((prev) => {
      if (prev.includes(label)) return prev
      const next = [...prev, label]
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          HIDDEN_DEFAULT_COMMANDS_KEY,
          JSON.stringify(next)
        )
      }
      return next
    })
  }

  useEffect(() => {
    let nextValue: string | undefined

    for (const group of menuGroups) {
      if (group.items.length > 0) {
        nextValue = group.items[0]?.value
        break
      }
    }

    if (!nextValue && menuState === 'selectionCommand' && commands.length > 0) {
      nextValue = commands[0].label
    }

    setValue(nextValue ?? '')
  }, [commands, menuGroups, menuState, setValue])

  return (
    <>
      {menuGroups.map((group, index) => (
        <CommandGroup heading={group.heading} key={index}>
          {group.items.map((menuItem) => (
            <CommandItem
              className="group [&_svg]:text-muted-foreground"
              key={menuItem.value}
              onSelect={() => {
                menuItem.onSelect({ editor, input })
                setInput('')
              }}
              value={menuItem.value}
              disabled={disabled}
            >
              {menuItem.icon}
              <span>{menuItem.label}</span>
              {menuState === 'selectionCommand' && (
                <button
                  type="button"
                  className="ml-auto size-5 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 group/item"
                  onClick={(e) => {
                    e.stopPropagation()
                    hideDefaultCommand(menuItem.label)
                  }}
                >
                  <Trash2Icon className="size-3.5 text-muted-foreground group-hover/item:text-destructive/80" />
                </button>
              )}
            </CommandItem>
          ))}
          {menuState === 'selectionCommand' &&
            commands.map((command) => (
              <CommandItem
                className="group"
                key={command.label}
                onSelect={() => {
                  editor.getApi(AIChatPlugin).aiChat.submit(input, {
                    mode: 'chat',
                    prompt: command.prompt,
                    toolName: 'edit',
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
