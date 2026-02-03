import {
	deletePassword as deletePasswordFromKeyring,
	getPassword as getPasswordFromKeyring,
	setPassword as setPasswordInKeyring,
} from "tauri-plugin-keyring-api"
import type { StateCreator } from "zustand"
import { fetchOllamaModels as fetchOllamaModelsFromApi } from "@/lib/ollama"

export type ChatConfig = {
	provider: string
	model: string
	apiKey: string
}

export type ApiModels = { [provider: string]: string[] }
export type EnabledChatModels = { provider: string; model: string }[]

export type AISettingsSlice = {
	connectedProviders: string[]
	chatConfig: ChatConfig | null
	renameConfig: ChatConfig | null
	apiModels: ApiModels
	ollamaModels: string[]
	enabledChatModels: EnabledChatModels
	connectProvider: (provider: string, apiKey: string) => void
	disconnectProvider: (provider: string) => void
	fetchOllamaModels: () => Promise<void>
	selectModel: (provider: string, model: string) => Promise<void>
	selectRenameModel: (provider: string, model: string) => Promise<void>
	clearRenameModel: () => void
	toggleModelEnabled: (
		provider: string,
		model: string,
		checked: boolean,
	) => void
}

type AISettingsSliceDependencies = {
	fetchOllamaModels: typeof fetchOllamaModelsFromApi
	getPassword: typeof getPasswordFromKeyring
	setPassword: typeof setPasswordInKeyring
	deletePassword: typeof deletePasswordFromKeyring
}

const API_MODELS_MAP: Record<string, string[]> = {
	google: [
		"gemini-3-flash-preview",
		"gemini-2.5-flash",
		"gemini-2.5-flash-lite",
	],
	openai: ["gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano"],
	anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5"],
}

const CONNECTED_PROVIDERS_KEY = "connected-providers"
const CHAT_CONFIG_KEY = "chat-config"
const RENAME_CONFIG_KEY = "rename-config"
const ENABLED_CHAT_MODELS_KEY = "chat-enabled-models"

export const prepareAISettingsSlice =
	({
		fetchOllamaModels,
		getPassword,
		setPassword,
		deletePassword,
	}: AISettingsSliceDependencies): StateCreator<
		AISettingsSlice,
		[],
		[],
		AISettingsSlice
	> =>
	(set) => {
		const loadPersistedSettings = () => {
			const rawConnectedProviders = localStorage.getItem(
				CONNECTED_PROVIDERS_KEY,
			)
			const rawChatConfig = localStorage.getItem(CHAT_CONFIG_KEY)
			const rawRenameConfig = localStorage.getItem(RENAME_CONFIG_KEY)
			const rawEnabledChatModels = localStorage.getItem(ENABLED_CHAT_MODELS_KEY)

			let connectedProviders: string[] = []
			let chatConfig: ChatConfig | null = null
			let renameConfig: ChatConfig | null = null
			let enabledChatModels: EnabledChatModels = []

			if (rawConnectedProviders) {
				try {
					connectedProviders = JSON.parse(rawConnectedProviders) as string[]
				} catch (error) {
					console.error("Failed to parse connected providers:", error)
				}
			}
			if (rawChatConfig) {
				try {
					chatConfig = JSON.parse(rawChatConfig) as ChatConfig
				} catch (error) {
					console.error("Failed to parse chat config:", error)
				}
			}
			if (rawRenameConfig) {
				try {
					renameConfig = JSON.parse(rawRenameConfig) as ChatConfig
				} catch (error) {
					console.error("Failed to parse rename config:", error)
				}
			}
			if (rawEnabledChatModels) {
				try {
					const parsedEnabledChatModels = JSON.parse(
						rawEnabledChatModels,
					) as EnabledChatModels

					const filteredEnabledChatModels = parsedEnabledChatModels.filter(
						({ provider, model }) => {
							if (provider === "ollama") return true
							return API_MODELS_MAP[provider]?.includes(model) ?? false
						},
					)

					if (
						filteredEnabledChatModels.length !== parsedEnabledChatModels.length
					) {
						localStorage.setItem(
							ENABLED_CHAT_MODELS_KEY,
							JSON.stringify(filteredEnabledChatModels),
						)
					}

					enabledChatModels = filteredEnabledChatModels
				} catch (error) {
					console.error("Failed to parse enabled models:", error)
				}
			}
			return {
				connectedProviders,
				chatConfig,
				renameConfig,
				enabledChatModels,
			}
		}

		const initialSettings = loadPersistedSettings()

		return {
			...initialSettings,
			apiModels: API_MODELS_MAP,
			ollamaModels: [],

			connectProvider: (provider: string, apiKey: string) => {
				set((prev) => {
					const newConnectedProviders = [...prev.connectedProviders, provider]
					localStorage.setItem(
						CONNECTED_PROVIDERS_KEY,
						JSON.stringify(newConnectedProviders),
					)
					setPassword(`app.mdit.ai.${provider}`, "mdit", apiKey)
					return { connectedProviders: newConnectedProviders }
				})
			},

			disconnectProvider: (provider: string) => {
				set((prev) => {
					const newConnectedProviders = prev.connectedProviders.filter(
						(p) => p !== provider,
					)
					localStorage.setItem(
						CONNECTED_PROVIDERS_KEY,
						JSON.stringify(newConnectedProviders),
					)
					deletePassword(`app.mdit.ai.${provider}`, "mdit")

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

					const newEnabledChatModels = prev.enabledChatModels.filter(
						(m) => m.provider !== provider,
					)
					if (newEnabledChatModels.length !== prev.enabledChatModels.length) {
						localStorage.setItem(
							ENABLED_CHAT_MODELS_KEY,
							JSON.stringify(newEnabledChatModels),
						)
						newState.enabledChatModels = newEnabledChatModels
					}

					return newState
				})
			},

			fetchOllamaModels: async () => {
				const modelNames = await fetchOllamaModels()
				set({ ollamaModels: modelNames })
			},

			selectModel: async (provider: string, model: string) => {
				if (provider === "ollama") {
					set((prev) => {
						if (!prev.ollamaModels.includes(model)) {
							return {}
						}

						const newChatConfig: ChatConfig = {
							provider,
							model,
							apiKey: "",
						}

						localStorage.setItem(CHAT_CONFIG_KEY, JSON.stringify(newChatConfig))
						return { chatConfig: newChatConfig }
					})
					return
				}

				const apiKey = await getPassword(`app.mdit.ai.${provider}`, "mdit")
				if (!apiKey) {
					return
				}

				set((prev) => {
					const prevProvider = prev.chatConfig?.provider
					if (prevProvider === provider) {
						const updatedChatConfig: ChatConfig = {
							provider,
							model,
							apiKey: prev.chatConfig?.apiKey || apiKey,
						}

						localStorage.setItem(
							CHAT_CONFIG_KEY,
							JSON.stringify(updatedChatConfig),
						)

						return {
							chatConfig: updatedChatConfig,
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
				if (provider === "ollama") {
					set((prev) => {
						if (!prev.ollamaModels.includes(model)) {
							return {}
						}

						const newRenameConfig: ChatConfig = {
							provider,
							model,
							apiKey: "",
						}

						localStorage.setItem(
							RENAME_CONFIG_KEY,
							JSON.stringify(newRenameConfig),
						)
						return { renameConfig: newRenameConfig }
					})
					return
				}

				const apiKey = await getPassword(`app.mdit.ai.${provider}`, "mdit")
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

					localStorage.setItem(
						RENAME_CONFIG_KEY,
						JSON.stringify(newRenameConfig),
					)

					return { renameConfig: newRenameConfig }
				})
			},

			clearRenameModel: () => {
				set(() => {
					localStorage.removeItem(RENAME_CONFIG_KEY)
					return { renameConfig: null }
				})
			},

			toggleModelEnabled: (
				provider: string,
				model: string,
				checked: boolean,
			) => {
				set((prev) => {
					const newEnabledChatModels = checked
						? [...prev.enabledChatModels, { provider, model }]
						: prev.enabledChatModels.filter(
								(m) => m.provider !== provider || m.model !== model,
							)

					localStorage.setItem(
						ENABLED_CHAT_MODELS_KEY,
						JSON.stringify(newEnabledChatModels),
					)

					const newState: {
						enabledChatModels: EnabledChatModels
						chatConfig?: ChatConfig | null
						renameConfig?: ChatConfig | null
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
					if (
						!checked &&
						prev.renameConfig?.provider === provider &&
						prev.renameConfig?.model === model
					) {
						localStorage.removeItem(RENAME_CONFIG_KEY)
						newState.renameConfig = null
					}

					return newState
				})
			},
		}
	}

export const createAISettingsSlice = prepareAISettingsSlice({
	fetchOllamaModels: fetchOllamaModelsFromApi,
	getPassword: getPasswordFromKeyring,
	setPassword: setPasswordInKeyring,
	deletePassword: deletePasswordFromKeyring,
})
