import {
  deletePassword,
  getPassword,
  setPassword,
} from 'tauri-plugin-keyring-api'
import { create } from 'zustand'

export type ChatConfig = {
  provider: string
  model: string
  apiKey: string
}

export type ApiModels = { [provider: string]: string[] }
export type EnabledChatModels = { provider: string; model: string }[]

type AISettingsStore = {
  connectedProviders: string[]
  chatConfig: ChatConfig | null
  renameConfig: ChatConfig | null
  apiModels: ApiModels
  ollamaModels: string[]
  enabledChatModels: EnabledChatModels
  connectProvider: (provider: string, apiKey: string) => void
  disconnectProvider: (provider: string) => void
  addOllamaModel: (model: string) => void
  removeOllamaModel: (model: string) => void
  selectModel: (provider: string, model: string) => Promise<void>
  selectRenameModel: (provider: string, model: string) => Promise<void>
  clearRenameModel: () => void
  toggleModelEnabled: (
    provider: string,
    model: string,
    checked: boolean
  ) => void
}

const API_MODELS_MAP: Record<string, string[]> = {
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
}

const CONNECTED_PROVIDERS_KEY = 'connected-providers'
const CHAT_CONFIG_KEY = 'chat-config'
const RENAME_CONFIG_KEY = 'rename-config'
const ENABLED_CHAT_MODELS_KEY = 'chat-enabled-models'
const OLLAMA_MODELS_KEY = 'ollama-models'

export const useAISettingsStore = create<AISettingsStore>((set) => {
  // Load persisted settings on initialization
  const loadPersistedSettings = () => {
    const rawConnectedProviders = localStorage.getItem(CONNECTED_PROVIDERS_KEY)
    const rawChatConfig = localStorage.getItem(CHAT_CONFIG_KEY)
    const rawRenameConfig = localStorage.getItem(RENAME_CONFIG_KEY)
    const rawEnabledChatModels = localStorage.getItem(ENABLED_CHAT_MODELS_KEY)
    const rawOllamaModels = localStorage.getItem(OLLAMA_MODELS_KEY)

    let connectedProviders: string[] = []
    let chatConfig: ChatConfig | null = null
    let renameConfig: ChatConfig | null = null
    let enabledChatModels: EnabledChatModels = []
    let ollamaModels: string[] = []

    if (rawConnectedProviders) {
      try {
        connectedProviders = JSON.parse(rawConnectedProviders) as string[]
      } catch (error) {
        console.error('Failed to parse connected providers:', error)
      }
    }
    if (rawChatConfig) {
      try {
        chatConfig = JSON.parse(rawChatConfig) as ChatConfig
      } catch (error) {
        console.error('Failed to parse chat config:', error)
      }
    }
    if (rawRenameConfig) {
      try {
        renameConfig = JSON.parse(rawRenameConfig) as ChatConfig
      } catch (error) {
        console.error('Failed to parse rename config:', error)
      }
    }
    if (rawEnabledChatModels) {
      try {
        enabledChatModels = JSON.parse(
          rawEnabledChatModels
        ) as EnabledChatModels
      } catch (error) {
        console.error('Failed to parse enabled models:', error)
      }
    }
    if (rawOllamaModels) {
      try {
        ollamaModels = JSON.parse(rawOllamaModels) as string[]
      } catch (error) {
        console.error('Failed to parse ollama models:', error)
      }
    }
    return {
      connectedProviders,
      chatConfig,
      renameConfig,
      enabledChatModels,
      ollamaModels,
    }
  }

  const initialSettings = loadPersistedSettings()

  return {
    ...initialSettings,
    apiModels: API_MODELS_MAP,

    connectProvider: (provider: string, apiKey: string) => {
      set((prev) => {
        const newConnectedProviders = [...prev.connectedProviders, provider]
        localStorage.setItem(
          CONNECTED_PROVIDERS_KEY,
          JSON.stringify(newConnectedProviders)
        )
        setPassword(`app.mdit.ai.${provider}`, 'mdit', apiKey)
        return { connectedProviders: newConnectedProviders }
      })
    },

    disconnectProvider: (provider: string) => {
      set((prev) => {
        const newConnectedProviders = prev.connectedProviders.filter(
          (p) => p !== provider
        )
        localStorage.setItem(
          CONNECTED_PROVIDERS_KEY,
          JSON.stringify(newConnectedProviders)
        )
        deletePassword(`app.mdit.ai.${provider}`, 'mdit')

        // Initialize chatConfig if it matches the disconnected provider
        const newState: {
          connectedProviders: string[]
          chatConfig?: ChatConfig | null
          renameConfig?: ChatConfig | null
          enabledChatModels?: EnabledChatModels
        } = {
          connectedProviders: newConnectedProviders,
        }
        if (prev.chatConfig?.provider === provider) {
          localStorage.removeItem(CHAT_CONFIG_KEY)
          newState.chatConfig = null
        }
        if (prev.renameConfig?.provider === provider) {
          localStorage.removeItem(RENAME_CONFIG_KEY)
          newState.renameConfig = null
        }

        // Remove enabled models for this provider
        const newEnabledChatModels = prev.enabledChatModels.filter(
          (m) => m.provider !== provider
        )
        if (newEnabledChatModels.length !== prev.enabledChatModels.length) {
          localStorage.setItem(
            ENABLED_CHAT_MODELS_KEY,
            JSON.stringify(newEnabledChatModels)
          )
          newState.enabledChatModels = newEnabledChatModels
        }

        return newState
      })
    },

    addOllamaModel: (model: string) => {
      set((prev) => {
        const newOllamaModels = [...prev.ollamaModels, model]
        const newEnabledChatModels = [
          ...prev.enabledChatModels,
          { provider: 'ollama', model },
        ]
        localStorage.setItem(OLLAMA_MODELS_KEY, JSON.stringify(newOllamaModels))
        localStorage.setItem(
          ENABLED_CHAT_MODELS_KEY,
          JSON.stringify(newEnabledChatModels)
        )
        return {
          ollamaModels: newOllamaModels,
          enabledChatModels: newEnabledChatModels,
        }
      })
    },

    removeOllamaModel: (model: string) => {
      set((prev) => {
        const newOllamaModels = prev.ollamaModels.filter((m) => m !== model)
        localStorage.setItem(OLLAMA_MODELS_KEY, JSON.stringify(newOllamaModels))

        // Initialize chatConfig if it's ollama provider and matches the removed model
        const newState: {
          ollamaModels: string[]
          chatConfig?: ChatConfig | null
          renameConfig?: ChatConfig | null
          enabledChatModels?: EnabledChatModels
        } = {
          ollamaModels: newOllamaModels,
        }
        if (
          prev.chatConfig?.provider === 'ollama' &&
          prev.chatConfig?.model === model
        ) {
          localStorage.removeItem(CHAT_CONFIG_KEY)
          newState.chatConfig = null
        }
        if (
          prev.renameConfig?.provider === 'ollama' &&
          prev.renameConfig?.model === model
        ) {
          localStorage.removeItem(RENAME_CONFIG_KEY)
          newState.renameConfig = null
        }

        // Remove enabled model for this ollama model
        const newEnabledChatModels = prev.enabledChatModels.filter(
          (m) => !(m.provider === 'ollama' && m.model === model)
        )
        if (newEnabledChatModels.length !== prev.enabledChatModels.length) {
          localStorage.setItem(
            ENABLED_CHAT_MODELS_KEY,
            JSON.stringify(newEnabledChatModels)
          )
          newState.enabledChatModels = newEnabledChatModels
        }

        return newState
      })
    },

    selectModel: async (provider: string, model: string) => {
      // Handle Ollama provider without API key
      if (provider === 'ollama') {
        set((prev) => {
          // Verify that the model exists in ollamaModels
          if (!prev.ollamaModels.includes(model)) {
            return {}
          }

          const newChatConfig: ChatConfig = {
            provider,
            model,
            apiKey: '', // Ollama doesn't need API key
          }

          localStorage.setItem(CHAT_CONFIG_KEY, JSON.stringify(newChatConfig))
          return { chatConfig: newChatConfig }
        })
        return
      }

      // For other providers, require API key
      const apiKey = await getPassword(`app.mdit.ai.${provider}`, 'mdit')
      if (!apiKey) {
        return
      }

      set((prev) => {
        const prevProvider = prev.chatConfig?.provider
        if (prevProvider === provider) {
          return {
            chatConfig: {
              provider,
              model,
              apiKey: prev.chatConfig?.apiKey || '',
            },
          }
        }

        const newChatConfig: ChatConfig = {
          provider,
          model,
          apiKey,
        }

        localStorage.setItem(CHAT_CONFIG_KEY, JSON.stringify(newChatConfig))
        return { chatConfig: newChatConfig }
      })
    },

    selectRenameModel: async (provider: string, model: string) => {
      if (provider === 'ollama') {
        set((prev) => {
          if (!prev.ollamaModels.includes(model)) {
            return {}
          }

          const newRenameConfig: ChatConfig = {
            provider,
            model,
            apiKey: '',
          }

          localStorage.setItem(
            RENAME_CONFIG_KEY,
            JSON.stringify(newRenameConfig)
          )
          return { renameConfig: newRenameConfig }
        })
        return
      }

      const apiKey = await getPassword(`app.mdit.ai.${provider}`, 'mdit')
      if (!apiKey) {
        return
      }

      set((prev) => {
        const newRenameConfig: ChatConfig = {
          provider,
          model,
          apiKey:
            prev.renameConfig?.provider === provider &&
            prev.renameConfig?.apiKey
              ? prev.renameConfig.apiKey
              : apiKey,
        }

        localStorage.setItem(RENAME_CONFIG_KEY, JSON.stringify(newRenameConfig))

        return { renameConfig: newRenameConfig }
      })
    },

    clearRenameModel: () => {
      set(() => {
        localStorage.removeItem(RENAME_CONFIG_KEY)
        return { renameConfig: null }
      })
    },

    toggleModelEnabled: (provider: string, model: string, checked: boolean) => {
      set((prev) => {
        const newEnabledChatModels = checked
          ? [...prev.enabledChatModels, { provider, model }]
          : prev.enabledChatModels.filter(
              (m) => m.provider !== provider || m.model !== model
            )

        localStorage.setItem(
          ENABLED_CHAT_MODELS_KEY,
          JSON.stringify(newEnabledChatModels)
        )

        // Initialize chatConfig if disabling the current model
        const newState: {
          enabledChatModels: EnabledChatModels
          chatConfig?: ChatConfig | null
        } = {
          enabledChatModels: newEnabledChatModels,
        }
        if (
          !checked &&
          prev.chatConfig?.provider === provider &&
          prev.chatConfig?.model === model
        ) {
          localStorage.removeItem(CHAT_CONFIG_KEY)
          newState.chatConfig = null
        }

        return newState
      })
    },
  }
})
