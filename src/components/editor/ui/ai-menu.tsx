import { AIChatPlugin, useEditorChat } from '@platejs/ai/react'
import { BlockSelectionPlugin, useIsSelecting } from '@platejs/selection/react'
import { Command as CommandPrimitive } from 'cmdk'
import {
  Album,
  Check,
  ChevronDownIcon,
  CornerUpLeft,
  FeatherIcon,
  Link,
  ListMinus,
  ListPlus,
  Loader2Icon,
  PauseIcon,
  PenLine,
  SmileIcon,
  UnlinkIcon,
  Wand,
  X,
} from 'lucide-react'
import { isHotkey, NodeApi, type NodeEntry } from 'platejs'
import {
  type PlateEditor,
  useEditorPlugin,
  useEditorRef,
  useFocusedLast,
  useHotkeys,
  usePluginOption,
} from 'platejs/react'
import { useEffect, useMemo, useState } from 'react'
import {
  deletePassword,
  getPassword,
  setPassword,
} from 'tauri-plugin-keyring-api'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Command, CommandGroup, CommandItem, CommandList } from '@/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Input } from '@/ui/input'

import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover'
import { useChat } from '../hooks/use-chat'

const providers = {
  google: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
}

export function AIMenu() {
  const { api, editor } = useEditorPlugin(AIChatPlugin)
  const mode = usePluginOption(AIChatPlugin, 'mode')
  const streaming = usePluginOption(AIChatPlugin, 'streaming')
  const isFocusedLast = useFocusedLast()
  const open = usePluginOption(AIChatPlugin, 'open') && isFocusedLast
  const [value, setValue] = useState('')
  const [connectedProviders, setConnectedProviders] = useState<string[]>([])
  const [chatConfig, setChatConfig] = useState<{
    provider: string
    model: string
    apiKey: string
  } | null>(null)
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)

  const chat = useChat(chatConfig)

  const { input, messages, setInput, status, stop } = chat
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false)

  // Load connected providers from localStorage on mount
  useEffect(() => {
    if (isConfigLoaded && !open) return
    const loadConnectedProviders = async () => {
      try {
        const stored = localStorage.getItem('mdit-connected-providers')
        const connected = stored ? JSON.parse(stored) : []
        setConnectedProviders(connected)

        // Load default config if available
        const defaultConfig = localStorage.getItem('mdit-default-config')
        if (defaultConfig) {
          const config = JSON.parse(defaultConfig)
          if (connected.includes(config.provider)) {
            // Load API key for the default provider
            try {
              const apiKey = await getPassword(
                `${config.provider}-api-key`,
                'mdit'
              )
              if (apiKey) {
                setChatConfig({
                  provider: config.provider,
                  model: config.model,
                  apiKey,
                })
              }
            } catch {
              console.error(
                'Failed to load API key for default provider:',
                config.provider
              )
            }
          }
        }
      } catch {
        // Failed to load from localStorage
        setConnectedProviders([])
      } finally {
        setIsConfigLoaded(true)
      }
    }

    loadConnectedProviders()
  }, [isConfigLoaded, open])

  // Helper function to load API key and set config
  const loadApiKeyAndSetConfig = async (provider: string, model: string) => {
    try {
      const apiKey = await getPassword(`${provider}-api-key`, 'mdit')
      if (apiKey) {
        setChatConfig({
          provider,
          model,
          apiKey,
        })
        // Save as default config
        localStorage.setItem(
          'mdit-default-config',
          JSON.stringify({ provider, model })
        )
      }
    } catch {
      console.error('Failed to load API key for provider:', provider)
    }
  }

  const handleApiKeySubmit = async (provider: string, apiKey: string) => {
    try {
      await setPassword(`${provider}-api-key`, 'mdit', apiKey)
      const updatedProviders = [...connectedProviders, provider]
      setConnectedProviders(updatedProviders)

      // Update localStorage
      localStorage.setItem(
        'mdit-connected-providers',
        JSON.stringify(updatedProviders)
      )

      // Set as default config
      const model = providers[provider as keyof typeof providers][0]
      setChatConfig({
        provider,
        model,
        apiKey,
      })

      // Save as default config
      localStorage.setItem(
        'mdit-default-config',
        JSON.stringify({ provider, model })
      )

      setShowApiKeyInput(false)
      setApiKeyInput('')
    } catch {
      // Failed to save API key
    }
  }

  const handleModelSelect = async (provider: string, model: string) => {
    await loadApiKeyAndSetConfig(provider, model)
  }

  const handleProviderDisconnect = async (provider: string) => {
    try {
      await deletePassword(`${provider}-api-key`, 'mdit')
      const updatedProviders = connectedProviders.filter((p) => p !== provider)
      setConnectedProviders(updatedProviders)

      // Update localStorage
      localStorage.setItem(
        'mdit-connected-providers',
        JSON.stringify(updatedProviders)
      )

      // If the disconnected provider was the current config, clear it
      if (chatConfig?.provider === provider) {
        setChatConfig(null)
        localStorage.removeItem('mdit-default-config')
      }
    } catch {
      console.error('Failed to disconnect provider')
    }
  }

  const handleAccept = () => {
    editor.tf.withoutNormalizing(() => {
      editor.tf.removeNodes({
        match: (n) =>
          n.diff === true &&
          (n.diffOperation as { type: string })?.type === 'delete',
        at: [],
        mode: 'lowest',
      })

      editor.tf.unsetNodes(['diff', 'diffOperation'], {
        at: [],
        match: (n) => n.diff === true,
        mode: 'lowest',
      })

      editor.getApi(AIChatPlugin).aiChat.hide()
    })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: true
  useEffect(() => {
    if (streaming) {
      const anchor = api.aiChat.node({ anchor: true })
      if (!anchor) return
      const anchorDom = editor.api.toDOMNode(anchor[0])
      if (!anchorDom) return
      setAnchorElement(anchorDom)
    }
  }, [streaming])

  const setOpen = (open: boolean) => {
    if (open) {
      api.aiChat.show()
    } else {
      api.aiChat.hide()
    }
  }

  const show = (anchorElement: HTMLElement) => {
    setAnchorElement(anchorElement)
    setOpen(true)
  }

  useEditorChat({
    chat,
    onOpenBlockSelection: (blocks: NodeEntry[]) => {
      const lastBlock = blocks.at(-1)
      if (!lastBlock) return
      const domNode = editor.api.toDOMNode(lastBlock[0])
      if (!domNode) return
      show(domNode)
    },
    onOpenChange: (open) => {
      if (!open) {
        setAnchorElement(null)
        setInput('')
      }
    },
    onOpenCursor: () => {
      const highestBlock = editor.api.block({ highest: true })
      if (!highestBlock) return
      const ancestor = highestBlock[0]

      if (!(editor.api.isAt({ end: true }) || editor.api.isEmpty(ancestor))) {
        editor
          .getApi(BlockSelectionPlugin)
          .blockSelection.set(ancestor.id as string)
      }

      const domNode = editor.api.toDOMNode(ancestor)
      if (!domNode) return
      show(domNode)
    },
    onOpenSelection: () => {
      const lastBlock = editor.api.blocks().at(-1)
      if (!lastBlock) return
      const domNode = editor.api.toDOMNode(lastBlock[0])
      if (!domNode) return
      show(domNode)
    },
  })

  useHotkeys('esc', () => {
    stop()
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  if (isLoading && mode === 'insert') {
    return null
  }

  return (
    <Popover
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          handleAccept()
        }
        setOpen(open)
      }}
      modal
    >
      <PopoverAnchor virtualRef={{ current: anchorElement! }} />

      <PopoverContent
        className="border-none bg-transparent p-0 shadow-none"
        align="center"
        side="bottom"
        style={{
          width: anchorElement?.offsetWidth,
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          handleAccept()
        }}
      >
        <div className="flex justify-end py-1">
          <DropdownMenu
            open={modelPopoverOpen}
            onOpenChange={setModelPopoverOpen}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center text-xs gap-0.5 px-1.5 py-1 border rounded-full bg-background/50 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {chatConfig ? chatConfig.model : 'Select model'}
                <ChevronDownIcon className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(providers).map(([provider, models]) => (
                <DropdownMenuGroup key={provider}>
                  <div className="flex items-center justify-between">
                    <DropdownMenuLabel className="text-xs">
                      {provider}
                    </DropdownMenuLabel>
                    {connectedProviders.includes(provider) ? (
                      <button
                        type="button"
                        onClick={() => handleProviderDisconnect(provider)}
                        title={`Disconnect ${provider}`}
                        className="pr-2"
                      >
                        <UnlinkIcon className="size-3 hover:text-destructive" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowApiKeyInput(true)}
                        title={`Connect ${provider}`}
                        className="pr-2"
                      >
                        <Link className="size-3 hover:text-primary" />
                      </button>
                    )}
                  </div>
                  {connectedProviders.includes(provider)
                    ? models.map((model) => (
                        <DropdownMenuItem
                          key={model}
                          onClick={() => handleModelSelect(provider, model)}
                          className={cn(
                            'text-xs',
                            chatConfig?.provider === provider &&
                              chatConfig?.model === model &&
                              'bg-accent text-accent-foreground'
                          )}
                        >
                          {model}
                          {chatConfig?.provider === provider &&
                            chatConfig?.model === model && (
                              <Check className="ml-auto size-3" />
                            )}
                        </DropdownMenuItem>
                      ))
                    : showApiKeyInput && (
                        <div className="px-2 py-1">
                          <div className="space-y-2">
                            <Input
                              id="api-key"
                              type="password"
                              value={apiKeyInput}
                              onChange={(e) => setApiKeyInput(e.target.value)}
                              placeholder={`Enter ${provider} API key`}
                              className="md:text-xs h-7"
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleApiKeySubmit(provider, apiKeyInput)
                                }
                                disabled={!apiKeyInput.trim()}
                                className="text-xs h-7"
                              >
                                Connect
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setShowApiKeyInput(false)
                                  setApiKeyInput('')
                                }}
                                className="text-xs h-7"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Command
          className="w-full rounded-lg border shadow-md"
          onValueChange={setValue}
          value={value}
        >
          {isLoading ? (
            <div className="flex grow select-none items-center gap-2 p-2 text-muted-foreground text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              {messages.length > 1 ? 'Editing...' : 'Thinking...'}
            </div>
          ) : (
            <CommandPrimitive.Input
              autoFocus
              className={cn(
                'flex h-9 w-full min-w-0 bg-transparent border-input border-b px-3 py-1 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground md:text-sm dark:bg-input/30',
                'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
                'focus-visible:ring-transparent',
                !chatConfig && 'cursor-pointer'
              )}
              data-plate-focus
              onClick={() => {
                if (!chatConfig) {
                  setModelPopoverOpen(true)
                }
              }}
              onKeyDown={(e) => {
                if (isHotkey('backspace')(e) && input.length === 0) {
                  e.preventDefault()
                  api.aiChat.hide()
                }
                if (!chatConfig) {
                  setModelPopoverOpen(true)
                  return
                }
                if (isHotkey('enter')(e) && !e.shiftKey && !value) {
                  e.preventDefault()
                  api.aiChat.submit({
                    mode: 'chat',
                  })
                }
              }}
              onValueChange={setInput}
              placeholder={
                chatConfig
                  ? 'Ask AI anything...'
                  : 'Select a model to get started...'
              }
              value={input}
            />
          )}

          {!isLoading && (
            <CommandList>
              <AIMenuItems
                setValue={setValue}
                onAccept={handleAccept}
                disabled={!chatConfig}
              />
            </CommandList>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

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
    onSelect: ({ editor }) => {
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
    onSelect: ({ editor }) => {
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
  emojify: {
    icon: <SmileIcon />,
    label: 'Emojify',
    value: 'emojify',
    onSelect: ({ editor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Emojify',
      })
    },
  },
  fixSpelling: {
    icon: <Check />,
    label: 'Fix spelling & grammar',
    value: 'fixSpelling',
    onSelect: ({ editor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Fix spelling and grammar',
      })
    },
  },
  improveWriting: {
    icon: <Wand />,
    label: 'Improve writing',
    value: 'improveWriting',
    onSelect: ({ editor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Improve the writing',
      })
    },
  },
  makeLonger: {
    icon: <ListPlus />,
    label: 'Make longer',
    value: 'makeLonger',
    onSelect: ({ editor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Make longer',
      })
    },
  },
  makeShorter: {
    icon: <ListMinus />,
    label: 'Make shorter',
    value: 'makeShorter',
    onSelect: ({ editor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Make shorter',
      })
    },
  },
  simplifyLanguage: {
    icon: <FeatherIcon />,
    label: 'Simplify language',
    value: 'simplifyLanguage',
    onSelect: ({ editor }) => {
      editor.getApi(AIChatPlugin).aiChat.submit({
        prompt: 'Simplify the language',
      })
    },
  },
  summarize: {
    icon: <Album />,
    label: 'Add a summary',
    value: 'summarize',
    onSelect: ({ editor }) => {
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
        aiChatItems.emojify,
        aiChatItems.makeLonger,
        aiChatItems.makeShorter,
        aiChatItems.fixSpelling,
        aiChatItems.simplifyLanguage,
      ],
    },
  ],
}

export const AIMenuItems = ({
  setValue,
  onAccept,
  disabled,
}: {
  setValue: (value: string) => void
  onAccept: () => void
  disabled: boolean
}) => {
  const editor = useEditorRef()
  const { messages } = usePluginOption(AIChatPlugin, 'chat')
  const isSelecting = useIsSelecting()

  const menuState = useMemo(() => {
    if (messages && messages.length > 0) {
      return 'cursorSuggestion'
    }

    return isSelecting ? 'selectionCommand' : 'cursorCommand'
  }, [isSelecting, messages])

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
        </CommandGroup>
      ))}
    </>
  )
}

export function AILoadingBar() {
  const chat = usePluginOption(AIChatPlugin, 'chat')
  const mode = usePluginOption(AIChatPlugin, 'mode')
  const { status } = chat

  const { api } = useEditorPlugin(AIChatPlugin)

  const isLoading = status === 'streaming' || status === 'submitted'

  const visible = isLoading && mode === 'insert'

  if (!visible) return null

  return (
    <div
      className={cn(
        '-translate-x-1/2 absolute bottom-4 left-1/2 z-10 flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-1.5 text-muted-foreground text-sm shadow-md transition-all duration-300'
      )}
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      <span>{status === 'submitted' ? 'Thinking...' : 'Writing...'}</span>
      <Button
        className="flex items-center gap-1 text-xs"
        onClick={() => api.aiChat.stop()}
        size="sm"
        variant="ghost"
      >
        <PauseIcon className="h-4 w-4" />
        Stop
        <kbd className="ml-1 rounded bg-border px-1 font-mono text-[10px] text-muted-foreground shadow-sm">
          Esc
        </kbd>
      </Button>
    </div>
  )
}
