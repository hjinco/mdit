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

export type Models = { [provider: string]: string[] }
export type EnabledModels = { provider: string; model: string }[]

type AISettingsStore = {
  connectedProviders: string[]
  chatConfig: ChatConfig | null
  models: Models
  ollamaModels: string[]
  enabledModels: EnabledModels
  connectProvider: (provider: string, apiKey: string) => void
  disconnectProvider: (provider: string) => void
  addOllamaModel: (model: string) => void
  removeOllamaModel: (model: string) => void
  selectModel: (provider: string, model: string) => Promise<void>
  toggleModelEnabled: (
    provider: string,
    model: string,
    checked: boolean
  ) => void
}

const PROVIDERS_MAP: Record<string, string[]> = {
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  openai: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'],
}

const CONNECTED_PROVIDERS_KEY = 'connected-providers'
const CHAT_CONFIG_KEY = 'chat-config'
const ENABLED_MODELS_KEY = 'enabled-models'
const OLLAMA_MODELS_KEY = 'ollama-models'

export const useAISettingsStore = create<AISettingsStore>((set) => {
  // Load persisted settings on initialization
  const loadPersistedSettings = () => {
    const rawConnectedProviders = localStorage.getItem(CONNECTED_PROVIDERS_KEY)
    const rawChatConfig = localStorage.getItem(CHAT_CONFIG_KEY)
    const rawEnabledModels = localStorage.getItem(ENABLED_MODELS_KEY)
    const rawOllamaModels = localStorage.getItem(OLLAMA_MODELS_KEY)

    let connectedProviders: string[] = []
    let chatConfig: ChatConfig | null = null
    let enabledModels: EnabledModels = []
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
    if (rawEnabledModels) {
      try {
        enabledModels = JSON.parse(rawEnabledModels) as EnabledModels
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
    return { connectedProviders, chatConfig, enabledModels, ollamaModels }
  }

  const initialSettings = loadPersistedSettings()

  return {
    ...initialSettings,
    models: PROVIDERS_MAP,

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
          enabledModels?: EnabledModels
        } = {
          connectedProviders: newConnectedProviders,
        }
        if (prev.chatConfig?.provider === provider) {
          localStorage.removeItem(CHAT_CONFIG_KEY)
          newState.chatConfig = null
        }

        // Remove enabled models for this provider
        const newEnabledModels = prev.enabledModels.filter(
          (m) => m.provider !== provider
        )
        if (newEnabledModels.length !== prev.enabledModels.length) {
          localStorage.setItem(
            ENABLED_MODELS_KEY,
            JSON.stringify(newEnabledModels)
          )
          newState.enabledModels = newEnabledModels
        }

        return newState
      })
    },

    addOllamaModel: (model: string) => {
      set((prev) => {
        const newOllamaModels = [...prev.ollamaModels, model]
        const newEnabledModels = [
          ...prev.enabledModels,
          { provider: 'ollama', model },
        ]
        localStorage.setItem(OLLAMA_MODELS_KEY, JSON.stringify(newOllamaModels))
        localStorage.setItem(
          ENABLED_MODELS_KEY,
          JSON.stringify(newEnabledModels)
        )
        return {
          ollamaModels: newOllamaModels,
          enabledModels: newEnabledModels,
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
          enabledModels?: EnabledModels
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

        // Remove enabled model for this ollama model
        const newEnabledModels = prev.enabledModels.filter(
          (m) => !(m.provider === 'ollama' && m.model === model)
        )
        if (newEnabledModels.length !== prev.enabledModels.length) {
          localStorage.setItem(
            ENABLED_MODELS_KEY,
            JSON.stringify(newEnabledModels)
          )
          newState.enabledModels = newEnabledModels
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

    toggleModelEnabled: (provider: string, model: string, checked: boolean) => {
      set((prev) => {
        const newEnabledModels = checked
          ? [...prev.enabledModels, { provider, model }]
          : prev.enabledModels.filter(
              (m) => m.provider !== provider || m.model !== model
            )

        localStorage.setItem(
          ENABLED_MODELS_KEY,
          JSON.stringify(newEnabledModels)
        )

        // Initialize chatConfig if disabling the current model
        const newState: {
          enabledModels: EnabledModels
          chatConfig?: ChatConfig | null
        } = {
          enabledModels: newEnabledModels,
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
