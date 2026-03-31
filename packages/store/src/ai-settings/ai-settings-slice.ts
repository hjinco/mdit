import { API_MODELS_MAP, type ChatProviderId } from "@mdit/ai"
import type { StateCreator } from "zustand"
import type { BrowserStorageLike } from "../browser-storage"
import type {
	ApiKeyProviderId,
	CodexOAuthCredential,
	ProviderCredential,
	ProviderId,
} from "./credentials"
import type { OllamaModels } from "./ollama-types"

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
	ollamaCompletionModels: string[]
	ollamaEmbeddingModels: string[]
	enabledChatModels: EnabledChatModels
	loadAISettings: () => Promise<void>
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

export type AISettingsSliceDependencies = {
	storage: BrowserStorageLike
	fetchOllamaModelCatalog: () => Promise<OllamaModels>
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

function isProviderId(value: unknown): value is ProviderId {
	return (
		value === "google" ||
		value === "openai" ||
		value === "anthropic" ||
		value === "codex_oauth"
	)
}

function isChatProviderId(value: unknown): value is ChatProviderId {
	return value === "ollama" || isProviderId(value)
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
	storage: BrowserStorageLike,
	storageKey: string,
): PersistedModelConfig | null {
	const raw = storage.getItem(storageKey)
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
	storage: BrowserStorageLike,
	storageKey: string,
	config: Pick<ChatConfig, "provider" | "model"> | null,
) {
	if (!config) {
		storage.removeItem(storageKey)
		return
	}
	storage.setItem(
		storageKey,
		JSON.stringify({ provider: config.provider, model: config.model }),
	)
}

function isKnownModel(
	provider: ChatProviderId,
	model: string,
	ollamaCompletionModels: string[] = [],
): boolean {
	if (provider === "ollama") {
		return ollamaCompletionModels.length === 0
			? true
			: ollamaCompletionModels.includes(model)
	}
	return API_MODELS_MAP[provider]?.includes(model) ?? false
}

function readPersistedEnabledChatModels(
	storage: BrowserStorageLike,
): EnabledChatModels {
	const raw = storage.getItem(ENABLED_CHAT_MODELS_KEY)
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

function buildOllamaModelsStateUpdate(
	storage: BrowserStorageLike,
	prev: AISettingsSlice,
	modelCatalog: OllamaModels,
): Partial<AISettingsSlice> {
	const { completionModels, embeddingModels } = modelCatalog
	const nextEnabled = prev.enabledChatModels.filter((item) => {
		if (item.provider !== "ollama") {
			return true
		}
		return completionModels.includes(item.model)
	})

	const nextState: Partial<AISettingsSlice> = {
		ollamaCompletionModels: completionModels,
		ollamaEmbeddingModels: embeddingModels,
	}

	if (nextEnabled.length !== prev.enabledChatModels.length) {
		storage.setItem(ENABLED_CHAT_MODELS_KEY, JSON.stringify(nextEnabled))
		nextState.enabledChatModels = nextEnabled
	}

	if (
		prev.chatConfig?.provider === "ollama" &&
		!completionModels.includes(prev.chatConfig.model)
	) {
		storage.removeItem(CHAT_CONFIG_KEY)
		nextState.chatConfig = null
	}

	return nextState
}

export const prepareAISettingsSlice =
	({
		storage,
		fetchOllamaModelCatalog,
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
				storage.removeItem(CHAT_CONFIG_KEY)
				nextState.chatConfig = null
			}

			const enabledChatModels = prev.enabledChatModels.filter(
				(item) => item.provider !== provider,
			)
			if (enabledChatModels.length !== prev.enabledChatModels.length) {
				storage.setItem(
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
			if (!isKnownModel(provider, model, get().ollamaCompletionModels)) {
				return
			}

			if (provider === "ollama") {
				set((prev) => {
					if (!prev.ollamaCompletionModels.includes(model)) {
						return {}
					}
					const config: ChatConfig = {
						provider,
						model,
						apiKey: "",
					}
					writePersistedModelConfig(storage, CHAT_CONFIG_KEY, config)
					return { chatConfig: config }
				})
				return
			}

			const credential = await getCredential(provider)
			const config = toChatConfig(provider, model, credential)
			if (!config) {
				return
			}
			writePersistedModelConfig(storage, CHAT_CONFIG_KEY, config)
			set({ chatConfig: config })
		}

		return {
			connectedProviders: [],
			chatConfig: null,
			apiModels: API_MODELS_MAP,
			ollamaCompletionModels: [],
			ollamaEmbeddingModels: [],
			enabledChatModels: readPersistedEnabledChatModels(storage),

			loadAISettings: async () => {
				const connectedProviders = await listCredentialProviders()
				const connectedProviderSet = new Set(connectedProviders)

				const resolvePersistedConfig = async (
					storageKey: string,
				): Promise<ChatConfig | null> => {
					const persisted = readPersistedModelConfig(storage, storageKey)
					if (!persisted) {
						storage.removeItem(storageKey)
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
						storage.removeItem(storageKey)
						return null
					}

					const credential = await getCredential(persisted.provider)
					const resolved = toChatConfig(
						persisted.provider,
						persisted.model,
						credential,
					)
					if (!resolved) {
						storage.removeItem(storageKey)
						return null
					}

					return resolved
				}

				const chatConfig = await resolvePersistedConfig(CHAT_CONFIG_KEY)

				const persistedEnabled = readPersistedEnabledChatModels(storage)
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
					storage.setItem(
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
				try {
					const modelCatalog = await fetchOllamaModelCatalog()
					set((prev) =>
						buildOllamaModelsStateUpdate(storage, prev, modelCatalog),
					)
				} catch (error) {
					console.error("Failed to fetch Ollama models:", error)
				}
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

					storage.setItem(
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
						storage.removeItem(CHAT_CONFIG_KEY)
						nextState.chatConfig = null
					}

					return nextState
				})
			},
		}
	}
