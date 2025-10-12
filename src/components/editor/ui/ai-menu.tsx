import { AIChatPlugin, useEditorChat } from '@platejs/ai/react'
import { BlockSelectionPlugin, useIsSelecting } from '@platejs/selection/react'
import { isHotkey, KEYS, type NodeEntry } from 'platejs'
import {
  useEditorPlugin,
  useFocusedLast,
  useHotkeys,
  usePluginOption,
} from 'platejs/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  deletePassword,
  getPassword,
  setPassword,
} from 'tauri-plugin-keyring-api'
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover'
import { useAICommands } from '../hooks/use-ai-commands'
import { useChat } from '../hooks/use-chat'
import { AIMenuAddCommand } from './ai-menu-add-command'
import { AIMenuContent } from './ai-menu-content'

type EditorChatState = 'cursorCommand' | 'cursorSuggestion' | 'selectionCommand'

const defaultProviders: Record<string, string[]> = {
  google: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  ollama: [], // Empty array - users input custom model names
}

const createProviderModels = () =>
  Object.entries(defaultProviders).reduce<Record<string, string[]>>(
    (acc, [provider, models]) => {
      acc[provider] = [...models]
      return acc
    },
    {}
  )

const normalizeModelList = (models: unknown): string[] => {
  if (!Array.isArray(models)) return []

  const seen = new Set<string>()
  return models.reduce<string[]>((acc, value) => {
    if (typeof value !== 'string') return acc
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) return acc
    seen.add(trimmed)
    acc.push(trimmed)
    return acc
  }, [])
}

export function AIMenu() {
  const { api, editor } = useEditorPlugin(AIChatPlugin)
  const mode = usePluginOption(AIChatPlugin, 'mode')
  const toolName = usePluginOption(AIChatPlugin, 'toolName')
  const streaming = usePluginOption(AIChatPlugin, 'streaming')
  const isFocusedLast = useFocusedLast()
  const open = usePluginOption(AIChatPlugin, 'open') && isFocusedLast
  const [value, setValue] = useState('')
  const [connectedProviders, setConnectedProviders] = useState<string[]>([])
  const [providerModels, setProviderModels] =
    useState<Record<string, string[]>>(createProviderModels)
  const [chatConfig, setChatConfig] = useState<{
    provider: string
    model: string
    apiKey: string
  } | null>(null)
  const [isConfigLoaded, setIsConfigLoaded] = useState(false)

  const chat = useChat(chatConfig)

  const { status, messages } = chat
  const [input, setInput] = useState('')
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false)

  const [addCommandOpen, setAddCommandOpen] = useState(false)
  const { commands, addCommand, removeCommand } = useAICommands()

  const isSelecting = useIsSelecting()

  const hasAssistantSuggestion = useMemo(() => {
    if (!messages || status === 'error') return false

    return messages.some((message) => {
      if (message.role !== 'assistant') return false
      return message.parts.some(
        (part) => part.type === 'text' && part.text?.trim().length > 0
      )
    })
  }, [messages, status])

  const menuState = useMemo<EditorChatState>(() => {
    if (hasAssistantSuggestion) {
      return 'cursorSuggestion'
    }

    return isSelecting ? 'selectionCommand' : 'cursorCommand'
  }, [hasAssistantSuggestion, isSelecting])

  const submitMode = menuState === 'selectionCommand' ? 'chat' : 'insert'

  useEffect(() => {
    if (isConfigLoaded || !open) return
    const loadConnectedProviders = async () => {
      try {
        let connected: string[] = []
        const stored = localStorage.getItem('mdit-connected-providers')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            if (Array.isArray(parsed)) {
              connected = parsed.filter(
                (provider): provider is string => typeof provider === 'string'
              )
            }
          } catch {
            connected = []
          }
        }
        setConnectedProviders(connected)

        let ollamaModels: string[] = []
        const storedOllamaModels = localStorage.getItem('mdit-ollama-models')
        if (storedOllamaModels) {
          try {
            ollamaModels = normalizeModelList(JSON.parse(storedOllamaModels))
          } catch {
            ollamaModels = []
          }
        }

        const defaultConfigRaw = localStorage.getItem('mdit-default-config')
        if (defaultConfigRaw) {
          try {
            const config = JSON.parse(defaultConfigRaw) as {
              provider?: string
              model?: string
            }
            if (config?.provider && connected.includes(config.provider)) {
              if (config.provider === 'ollama') {
                const preferredModel =
                  typeof config.model === 'string' ? config.model.trim() : ''
                if (preferredModel) {
                  if (!ollamaModels.includes(preferredModel)) {
                    ollamaModels = [...ollamaModels, preferredModel]
                  }
                  setChatConfig({
                    provider: config.provider,
                    model: preferredModel,
                    apiKey: '',
                  })
                }
              } else {
                try {
                  const apiKey = await getPassword(
                    `${config.provider}-api-key`,
                    'mdit'
                  )
                  if (apiKey) {
                    setChatConfig({
                      provider: config.provider,
                      model: config.model ?? '',
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
            console.error('Failed to parse default config')
          }
        }

        setProviderModels((prev) => ({
          ...prev,
          ollama: ollamaModels,
        }))

        if (ollamaModels.length > 0) {
          localStorage.setItem(
            'mdit-ollama-models',
            JSON.stringify(ollamaModels)
          )
        } else {
          localStorage.removeItem('mdit-ollama-models')
        }
      } catch {
        setConnectedProviders([])
      } finally {
        setIsConfigLoaded(true)
      }
    }

    loadConnectedProviders()
  }, [isConfigLoaded, open])

  const loadApiKeyAndSetConfig = async (provider: string, model: string) => {
    try {
      const apiKey = await getPassword(`${provider}-api-key`, 'mdit')
      if (apiKey) {
        setChatConfig({
          provider,
          model,
          apiKey,
        })
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
      const updatedProviders = connectedProviders.includes(provider)
        ? connectedProviders
        : [...connectedProviders, provider]
      setConnectedProviders(updatedProviders)

      localStorage.setItem(
        'mdit-connected-providers',
        JSON.stringify(updatedProviders)
      )

      const availableModels = providerModels[provider] ?? []
      const model = availableModels[0]

      if (!model) {
        toast.error('No available models for provider')
        return
      }
      setChatConfig({
        provider,
        model,
        apiKey,
      })

      localStorage.setItem(
        'mdit-default-config',
        JSON.stringify({ provider, model })
      )
    } catch {
      toast.error('Failed to connect provider')
    }
  }

  const handleModelNameSubmit = async (provider: string, modelName: string) => {
    try {
      const trimmedName = modelName.trim()
      if (!trimmedName) return

      const updatedProviders = connectedProviders.includes(provider)
        ? connectedProviders
        : [...connectedProviders, provider]
      setConnectedProviders(updatedProviders)

      localStorage.setItem(
        'mdit-connected-providers',
        JSON.stringify(updatedProviders)
      )

      const storageKey = `mdit-${provider}-models`
      const existingModels = providerModels[provider] ?? []
      const updatedModels = existingModels.includes(trimmedName)
        ? existingModels
        : [...existingModels, trimmedName]

      setProviderModels((prev) => ({
        ...prev,
        [provider]: updatedModels,
      }))

      localStorage.setItem(storageKey, JSON.stringify(updatedModels))

      setChatConfig({
        provider,
        model: trimmedName,
        apiKey: '',
      })

      localStorage.setItem(
        'mdit-default-config',
        JSON.stringify({ provider, model: trimmedName })
      )
    } catch {
      toast.error('Failed to connect provider')
    }
  }

  const handleModelSelect = async (provider: string, model: string) => {
    if (provider === 'ollama') {
      setChatConfig({
        provider,
        model,
        apiKey: '',
      })

      localStorage.setItem(
        'mdit-default-config',
        JSON.stringify({ provider, model })
      )
      return
    }

    await loadApiKeyAndSetConfig(provider, model)
  }

  const handleProviderDisconnect = async (provider: string) => {
    try {
      // Delete API key if it exists (for providers like Google)
      try {
        await deletePassword(`${provider}-api-key`, 'mdit')
      } catch {
        // API key might not exist (e.g., for Ollama)
      }

      // Remove stored model list if it exists (for providers like Ollama)
      localStorage.removeItem(`mdit-${provider}-models`)

      if (provider === 'ollama') {
        setProviderModels((prev) => ({
          ...prev,
          [provider]: [],
        }))
      }

      const updatedProviders = connectedProviders.filter((p) => p !== provider)
      setConnectedProviders(updatedProviders)

      localStorage.setItem(
        'mdit-connected-providers',
        JSON.stringify(updatedProviders)
      )

      if (chatConfig?.provider === provider) {
        setChatConfig(null)
        localStorage.removeItem('mdit-default-config')
      }
    } catch {
      toast.error('Failed to disconnect provider')
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: true
  useEffect(() => {
    if (streaming) {
      const anchor = api.aiChat.node({ anchor: true })
      if (!anchor) return
      setTimeout(() => {
        const anchorDom = editor.api.toDOMNode(anchor![0])!
        setAnchorElement(anchorDom)
      }, 0)
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
    api.aiChat.stop()
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // biome-ignore lint/correctness/useExhaustiveDependencies: true
  useEffect(() => {
    if (toolName === 'edit' && mode === 'chat' && !isLoading) {
      let anchorNode = editor.api.node({
        at: [],
        reverse: true,
        match: (n) => !!n[KEYS.suggestion],
      })
      if (!anchorNode) {
        anchorNode = editor
          .getApi(BlockSelectionPlugin)
          .blockSelection.getNodes({ selectionFallback: true, sort: true })
          .at(-1)
      }
      if (!anchorNode) return
      const block = editor.api.block({ at: anchorNode[1] })
      setAnchorElement(editor.api.toDOMNode(block![0]!)!)
    }
  }, [isLoading])

  if (isLoading && mode === 'insert') return null
  if (toolName === 'comment') return null
  if (toolName === 'edit' && mode === 'chat' && isLoading) return null

  return (
    <Popover
      open={open}
      onOpenChange={(open) => {
        if (!open && addCommandOpen) {
          setAddCommandOpen(false)
          return
        }
        setOpen(open)
      }}
      modal
    >
      <PopoverAnchor virtualRef={{ current: anchorElement! }} />

      <PopoverContent
        // For the animation
        key={addCommandOpen ? 'addCommand' : 'content'}
        className="border-none bg-transparent p-0 shadow-none"
        align="center"
        side="bottom"
        style={{
          width: anchorElement?.offsetWidth,
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault()
        }}
      >
        {addCommandOpen ? (
          <AIMenuAddCommand
            onAdd={(command) => {
              addCommand(command)
              setAddCommandOpen(false)
            }}
            onClose={() => setAddCommandOpen(false)}
          />
        ) : (
          <AIMenuContent
            chatConfig={chatConfig}
            connectedProviders={connectedProviders}
            providers={providerModels}
            modelPopoverOpen={modelPopoverOpen}
            isLoading={isLoading}
            messages={messages}
            commands={commands}
            input={input}
            value={value}
            menuState={menuState}
            onModelPopoverOpenChange={setModelPopoverOpen}
            onProviderDisconnect={handleProviderDisconnect}
            onModelSelect={handleModelSelect}
            onApiKeySubmit={handleApiKeySubmit}
            onModelNameSubmit={handleModelNameSubmit}
            onValueChange={setValue}
            onInputChange={setInput}
            onInputClick={() => {
              if (!chatConfig) {
                setModelPopoverOpen(true)
              }
            }}
            onInputKeyDown={(e) => {
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
                api.aiChat.submit(input, { mode: submitMode, toolName: 'edit' })
                setInput('')
              }
            }}
            onAddCommandOpen={() => setAddCommandOpen(true)}
            onCommandRemove={(type, label) => {
              removeCommand(type, label)
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
