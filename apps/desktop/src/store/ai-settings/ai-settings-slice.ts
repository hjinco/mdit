import {
	API_MODELS_MAP,
	type ApiKeyProviderId,
	type ChatProviderId,
	type ProviderId,
} from "@mdit/ai"
import {
	type CodexOAuthCredential,
	deleteCredential as deleteCredentialFromStore,
	getCredential as getCredentialFromStore,
	isCodexCredentialExpiringSoon,
	listCredentialProviders,
	type ProviderCredential,
	refreshCodexAccessToken,
	setApiKeyCredential,
	setCodexCredential,
	startCodexBrowserOAuth,
} from "@mdit/credentials"
import type { StateCreator } from "zustand"
import { fetchOllamaModels as fetchOllamaModelsFromApi } from "@/lib/ollama"

export type ChatConfig = {
	provider: ChatProviderId
	model: string
	apiKey: string
	accountId?: string
}

export type ApiModels = Record<ProviderId, string[]>
export type EnabledChatModels = { provider: ChatProviderId; model: string }[]

type PersistedModelConfig = {
	provider: ChatProviderId
	model: string
}

export type AISettingsSlice = {
	connectedProviders: ProviderId[]
	chatConfig: ChatConfig | null
	apiModels: ApiModels
	ollamaModels: string[]
	enabledChatModels: EnabledChatModels
	initializeAISettings: () => Promise<void>
	connectProvider: (provider: ApiKeyProviderId, apiKey: string) => Promise<void>
	connectCodexOAuth: () => Promise<void>
	disconnectProvider: (provider: ProviderId) => Promise<void>
	refreshCodexOAuthForTarget: () => Promise<void>
	fetchOllamaModels: () => Promise<void>
	selectModel: (provider: ChatProviderId, model: string) => Promise<void>
	toggleModelEnabled: (
		provider: ChatProviderId,
		model: string,
		checked: boolean,
	) => void
}

type AISettingsSliceDependencies = {
	fetchOllamaModels: typeof fetchOllamaModelsFromApi
	listCredentialProviders: () => Promise<ProviderId[]>
	getCredential: (providerId: ProviderId) => Promise<ProviderCredential | null>
	setApiKeyCredential: (
		providerId: ApiKeyProviderId,
		apiKey: string,
	) => Promise<void>
	setCodexCredential: (credential: CodexOAuthCredential) => Promise<void>
	deleteCredential: (providerId: ProviderId) => Promise<void>
	startCodexBrowserOAuth: () => Promise<{
		accessToken: string
		refreshToken: string
		expiresAt: number
		accountId?: string
	}>
	refreshCodexAccessToken: (refreshToken: string) => Promise<{
		accessToken: string
		refreshToken: string
		expiresAt: number
		accountId?: string
	}>
	isCodexCredentialExpiringSoon: (
		credential: Pick<CodexOAuthCredential, "expiresAt">,
	) => boolean
}

const CHAT_CONFIG_KEY = "chat-config"
const ENABLED_CHAT_MODELS_KEY = "chat-enabled-models"

function isCredentialProviderId(value: unknown): value is ProviderId {
	return (
		value === "google" ||
		value === "openai" ||
		value === "anthropic" ||
		value === "codex_oauth"
	)
}

function isChatProviderId(value: unknown): value is ChatProviderId {
	return value === "ollama" || isCredentialProviderId(value)
}

function isPersistedModelConfig(value: unknown): value is PersistedModelConfig {
	if (typeof value !== "object" || value === null) {
		return false
	}
	const candidate = value as { provider?: unknown; model?: unknown }
	return (
		isChatProviderId(candidate.provider) && typeof candidate.model === "string"
	)
}

function toCodexCredential(
	value: ProviderCredential | null,
): CodexOAuthCredential | null {
	if (!value || value.type !== "oauth") {
		return null
	}
	return value
}

function toChatConfig(
	provider: ChatProviderId,
	model: string,
	credential: ProviderCredential | null,
): ChatConfig | null {
	if (provider === "ollama") {
		return {
			provider,
			model,
			apiKey: "",
		}
	}
	if (!credential) {
		return null
	}
	if (credential.type === "api_key") {
		return {
			provider,
			model,
			apiKey: credential.apiKey,
		}
	}
	return {
		provider,
		model,
		apiKey: credential.accessToken,
		accountId: credential.accountId,
	}
}

function readPersistedModelConfig(
	storageKey: string,
): PersistedModelConfig | null {
	const raw = localStorage.getItem(storageKey)
	if (!raw) {
		return null
	}
	try {
		const parsed = JSON.parse(raw) as unknown
		if (!isPersistedModelConfig(parsed)) {
			return null
		}
		return {
			provider: parsed.provider,
			model: parsed.model,
		}
	} catch {
		return null
	}
}

function writePersistedModelConfig(
	storageKey: string,
	config: Pick<ChatConfig, "provider" | "model"> | null,
) {
	if (!config) {
		localStorage.removeItem(storageKey)
		return
	}
	localStorage.setItem(
		storageKey,
		JSON.stringify({ provider: config.provider, model: config.model }),
	)
}

function isKnownModel(provider: ChatProviderId, model: string): boolean {
	if (provider === "ollama") {
		return true
	}
	return API_MODELS_MAP[provider]?.includes(model) ?? false
}

function readPersistedEnabledChatModels(): EnabledChatModels {
	const raw = localStorage.getItem(ENABLED_CHAT_MODELS_KEY)
	if (!raw) {
		return []
	}

	try {
		const parsed = JSON.parse(raw) as unknown
		if (!Array.isArray(parsed)) {
			return []
		}

		const models = parsed
			.filter((value): value is { provider: unknown; model: unknown } => {
				if (typeof value !== "object" || value === null) {
					return false
				}
				const candidate = value as { provider?: unknown; model?: unknown }
				return (
					isChatProviderId(candidate.provider) &&
					typeof candidate.model === "string"
				)
			})
			.map(({ provider, model }) => ({
				provider: provider as ChatProviderId,
				model: model as string,
			}))
			.filter(({ provider, model }) => isKnownModel(provider, model))

		return models
	} catch {
		return []
	}
}

export const prepareAISettingsSlice =
	({
		fetchOllamaModels,
		listCredentialProviders,
		getCredential,
		setApiKeyCredential,
		setCodexCredential,
		deleteCredential,
		startCodexBrowserOAuth,
		refreshCodexAccessToken,
		isCodexCredentialExpiringSoon,
	}: AISettingsSliceDependencies): StateCreator<
		AISettingsSlice,
		[],
		[],
		AISettingsSlice
	> =>
	(set, get) => {
		const withConnectedProvider = (
			providers: ProviderId[],
			provider: ProviderId,
		): ProviderId[] => {
			return providers.includes(provider) ? providers : [...providers, provider]
		}

		const syncCredentialToConfigs = (
			prev: AISettingsSlice,
			provider: ProviderId,
			apiKey: string,
			accountId?: string,
		): Partial<AISettingsSlice> => {
			const nextState: Partial<AISettingsSlice> = {
				connectedProviders: withConnectedProvider(
					prev.connectedProviders,
					provider,
				),
			}

			if (prev.chatConfig?.provider === provider) {
				nextState.chatConfig = {
					...prev.chatConfig,
					apiKey,
					accountId,
				}
			}

			return nextState
		}

		const clearProviderState = (
			prev: AISettingsSlice,
			provider: ProviderId,
		): Partial<AISettingsSlice> => {
			const connectedProviders = prev.connectedProviders.filter(
				(item) => item !== provider,
			)
			const nextState: Partial<AISettingsSlice> = {
				connectedProviders,
			}

			if (prev.chatConfig?.provider === provider) {
				localStorage.removeItem(CHAT_CONFIG_KEY)
				nextState.chatConfig = null
			}

			const enabledChatModels = prev.enabledChatModels.filter(
				(item) => item.provider !== provider,
			)
			if (enabledChatModels.length !== prev.enabledChatModels.length) {
				localStorage.setItem(
					ENABLED_CHAT_MODELS_KEY,
					JSON.stringify(enabledChatModels),
				)
				nextState.enabledChatModels = enabledChatModels
			}

			return nextState
		}

		const selectConfigModel = async (
			provider: ChatProviderId,
			model: string,
		): Promise<void> => {
			if (!isKnownModel(provider, model)) {
				return
			}

			if (provider === "ollama") {
				set((prev) => {
					if (!prev.ollamaModels.includes(model)) {
						return {}
					}
					const config: ChatConfig = {
						provider,
						model,
						apiKey: "",
					}
					writePersistedModelConfig(CHAT_CONFIG_KEY, config)
					return { chatConfig: config }
				})
				return
			}

			const credential = await getCredential(provider)
			const config = toChatConfig(provider, model, credential)
			if (!config) {
				return
			}
			writePersistedModelConfig(CHAT_CONFIG_KEY, config)
			set({ chatConfig: config })
		}

		return {
			connectedProviders: [],
			chatConfig: null,
			apiModels: API_MODELS_MAP,
			ollamaModels: [],
			enabledChatModels: readPersistedEnabledChatModels(),

			initializeAISettings: async () => {
				const connectedProviders = await listCredentialProviders()
				const connectedProviderSet = new Set(connectedProviders)

				const resolvePersistedConfig = async (
					storageKey: string,
				): Promise<ChatConfig | null> => {
					const persisted = readPersistedModelConfig(storageKey)
					if (!persisted) {
						localStorage.removeItem(storageKey)
						return null
					}

					if (persisted.provider === "ollama") {
						return {
							provider: "ollama",
							model: persisted.model,
							apiKey: "",
						}
					}

					if (!connectedProviderSet.has(persisted.provider)) {
						localStorage.removeItem(storageKey)
						return null
					}

					const credential = await getCredential(persisted.provider)
					const resolved = toChatConfig(
						persisted.provider,
						persisted.model,
						credential,
					)
					if (!resolved) {
						localStorage.removeItem(storageKey)
						return null
					}

					return resolved
				}

				const chatConfig = await resolvePersistedConfig(CHAT_CONFIG_KEY)

				const persistedEnabled = readPersistedEnabledChatModels()
				const filteredEnabled = persistedEnabled.filter(
					({ provider, model }) => {
						if (provider === "ollama") {
							return true
						}
						return (
							connectedProviderSet.has(provider) &&
							isKnownModel(provider, model)
						)
					},
				)
				if (filteredEnabled.length !== persistedEnabled.length) {
					localStorage.setItem(
						ENABLED_CHAT_MODELS_KEY,
						JSON.stringify(filteredEnabled),
					)
				}

				set({
					connectedProviders,
					chatConfig,
					enabledChatModels: filteredEnabled,
				})
			},

			connectProvider: async (provider: ApiKeyProviderId, apiKey: string) => {
				const normalizedApiKey = apiKey.trim()
				if (!normalizedApiKey) {
					return
				}

				await setApiKeyCredential(provider, normalizedApiKey)

				set((prev) => {
					return syncCredentialToConfigs(prev, provider, normalizedApiKey)
				})
			},

			connectCodexOAuth: async () => {
				const result = await startCodexBrowserOAuth()
				const credential: CodexOAuthCredential = {
					type: "oauth",
					accessToken: result.accessToken,
					refreshToken: result.refreshToken,
					expiresAt: result.expiresAt,
					accountId: result.accountId,
				}
				await setCodexCredential(credential)

				set((prev) => {
					return syncCredentialToConfigs(
						prev,
						"codex_oauth",
						credential.accessToken,
						credential.accountId,
					)
				})
			},

			disconnectProvider: async (provider: ProviderId) => {
				await deleteCredential(provider)

				set((prev) => {
					return clearProviderState(prev, provider)
				})
			},

			refreshCodexOAuthForTarget: async () => {
				const currentState = get()
				const hasCodexTarget =
					currentState.chatConfig?.provider === "codex_oauth"
				if (!hasCodexTarget) {
					return
				}

				const clearCodexState = () => {
					set((prev) => {
						return clearProviderState(prev, "codex_oauth")
					})
				}

				const storedCredential = toCodexCredential(
					await getCredential("codex_oauth"),
				)
				if (!storedCredential) {
					clearCodexState()
					return
				}

				let nextCredential = storedCredential
				if (isCodexCredentialExpiringSoon(storedCredential)) {
					try {
						const refreshed = await refreshCodexAccessToken(
							storedCredential.refreshToken,
						)
						nextCredential = {
							type: "oauth",
							accessToken: refreshed.accessToken,
							refreshToken: refreshed.refreshToken,
							expiresAt: refreshed.expiresAt,
							accountId: refreshed.accountId ?? storedCredential.accountId,
						}
						await setCodexCredential(nextCredential)
					} catch (error) {
						console.error("Failed to refresh Codex OAuth credential:", error)
						await deleteCredential("codex_oauth")
						clearCodexState()
						return
					}
				}

				set((prev) => {
					return syncCredentialToConfigs(
						prev,
						"codex_oauth",
						nextCredential.accessToken,
						nextCredential.accountId,
					)
				})
			},

			fetchOllamaModels: async () => {
				const modelNames = await fetchOllamaModels()
				set({ ollamaModels: modelNames })
			},

			selectModel: async (provider: ChatProviderId, model: string) => {
				await selectConfigModel(provider, model)
			},

			toggleModelEnabled: (
				provider: ChatProviderId,
				model: string,
				checked: boolean,
			) => {
				set((prev) => {
					const exists = prev.enabledChatModels.some(
						(item) => item.provider === provider && item.model === model,
					)

					const enabledChatModels = checked
						? exists
							? prev.enabledChatModels
							: [...prev.enabledChatModels, { provider, model }]
						: prev.enabledChatModels.filter(
								(item) => item.provider !== provider || item.model !== model,
							)

					localStorage.setItem(
						ENABLED_CHAT_MODELS_KEY,
						JSON.stringify(enabledChatModels),
					)

					const nextState: Partial<AISettingsSlice> = {
						enabledChatModels,
					}

					if (
						!checked &&
						prev.chatConfig?.provider === provider &&
						prev.chatConfig?.model === model
					) {
						localStorage.removeItem(CHAT_CONFIG_KEY)
						nextState.chatConfig = null
					}

					return nextState
				})
			},
		}
	}

export const createAISettingsSlice = prepareAISettingsSlice({
	fetchOllamaModels: fetchOllamaModelsFromApi,
	listCredentialProviders,
	getCredential: getCredentialFromStore,
	setApiKeyCredential,
	setCodexCredential,
	deleteCredential: deleteCredentialFromStore,
	startCodexBrowserOAuth,
	refreshCodexAccessToken,
	isCodexCredentialExpiringSoon,
})
