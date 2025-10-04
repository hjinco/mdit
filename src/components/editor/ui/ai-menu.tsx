import { AIChatPlugin, useEditorChat } from '@platejs/ai/react'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { isHotkey, type NodeEntry } from 'platejs'
import {
  useEditorPlugin,
  useFocusedLast,
  useHotkeys,
  usePluginOption,
} from 'platejs/react'
import { useEffect, useState } from 'react'
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

  const [addCommandOpen, setAddCommandOpen] = useState(false)
  const { commands, addCommand, removeCommand } = useAICommands()

  useEffect(() => {
    if (isConfigLoaded || !open) return
    const loadConnectedProviders = async () => {
      try {
        const stored = localStorage.getItem('mdit-connected-providers')
        const connected = stored ? JSON.parse(stored) : []
        setConnectedProviders(connected)

        const defaultConfig = localStorage.getItem('mdit-default-config')
        if (defaultConfig) {
          const config = JSON.parse(defaultConfig)
          if (connected.includes(config.provider)) {
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
      const updatedProviders = [...connectedProviders, provider]
      setConnectedProviders(updatedProviders)

      localStorage.setItem(
        'mdit-connected-providers',
        JSON.stringify(updatedProviders)
      )

      const model = providers[provider as keyof typeof providers][0]
      setChatConfig({
        provider,
        model,
        apiKey,
      })

      localStorage.setItem(
        'mdit-default-config',
        JSON.stringify({ provider, model })
      )

      setShowApiKeyInput(false)
      setApiKeyInput('')
    } catch {
      toast.error('Failed to connect provider')
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
          if (addCommandOpen) {
            setAddCommandOpen(false)
            return
          }
          handleAccept()
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
          handleAccept()
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
            showApiKeyInput={showApiKeyInput}
            apiKeyInput={apiKeyInput}
            modelPopoverOpen={modelPopoverOpen}
            isLoading={isLoading}
            messages={messages}
            commands={commands}
            input={input}
            value={value}
            onModelPopoverOpenChange={setModelPopoverOpen}
            onProviderDisconnect={handleProviderDisconnect}
            onShowApiKeyInput={setShowApiKeyInput}
            onApiKeyInputChange={setApiKeyInput}
            onModelSelect={handleModelSelect}
            onApiKeySubmit={handleApiKeySubmit}
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
                api.aiChat.submit({
                  mode: 'chat',
                })
              }
            }}
            onAccept={handleAccept}
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
