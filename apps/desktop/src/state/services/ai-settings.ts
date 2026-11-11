import {
	API_MODELS_MAP,
	type ApiKeyProviderId,
	type ChatProviderId,
	CREDENTIAL_PROVIDER_IDS,
	type ProviderId,
} from "@mdit/ai"
import { createState } from "../create-state"
import { createSerialQueue } from "./serial-queue"

export type { ApiKeyProviderId, ProviderId } from "@mdit/ai"

export type AppSecretKey = "license_key"

export type ApiKeyCredential = {
	type: "api_key"
	apiKey: string
}

export type CodexOAuthCredential = {
	type: "oauth"
	accessToken: string
	refreshToken: string
	expiresAt: number
	accountId?: string
}

export type ProviderCredential = ApiKeyCredential | CodexOAuthCredential

export type BrowserStorageLike = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem"
>

type ModelSelection = { provider: ChatProviderId; model: string }

export type ChatConfig = ModelSelection & { apiKey: string; accountId?: string }
export type ApiModels = Record<ProviderId, string[]>
export type EnabledChatModels = ModelSelection[]
export type OllamaModels = {
	completionModels: string[]
	embeddingModels: string[]
}

export type AISettingsSnapshot = {
	connectedProviders: ProviderId[]
	chatConfig: ChatConfig | null
	apiModels: ApiModels
	ollamaCompletionModels: string[]
	ollamaEmbeddingModels: string[]
	enabledChatModels: EnabledChatModels
}

export type AISettingsDependencies = {
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
	startCodexBrowserOAuth: () => Promise<Omit<CodexOAuthCredential, "type">>
	refreshCodexAccessToken: (
		refreshToken: string,
	) => Promise<Omit<CodexOAuthCredential, "type">>
	isCodexCredentialExpiringSoon: (
		credential: Pick<CodexOAuthCredential, "expiresAt">,
	) => boolean
}

const CHAT_CONFIG_KEY = "chat-config"
const ENABLED_MODELS_KEY = "chat-enabled-models"

function parseModelSelection(value: unknown): ModelSelection | null {
	if (typeof value !== "object" || value === null) {
		return null
	}

	const { provider, model } = value as Partial<ModelSelection>
	if (typeof model !== "string") {
		return null
	}
	if (provider === "ollama") {
		return { provider, model }
	}
	const credentialProvider = CREDENTIAL_PROVIDER_IDS.find(
		(item) => item === provider,
	)
	return credentialProvider ? { provider: credentialProvider, model } : null
}

function readJson(storage: BrowserStorageLike, key: string): unknown {
	const value = storage.getItem(key)
	try {
		return value === null ? null : JSON.parse(value)
	} catch {
		return null
	}
}

const createModelPreferences = (storage: BrowserStorageLike) => ({
	loadSelection: () => parseModelSelection(readJson(storage, CHAT_CONFIG_KEY)),
	saveSelection: (selection: ModelSelection | null) => {
		if (selection) {
			const { provider, model } = selection
			storage.setItem(CHAT_CONFIG_KEY, JSON.stringify({ provider, model }))
		} else {
			storage.removeItem(CHAT_CONFIG_KEY)
		}
	},
	loadEnabledModels: () => {
		const raw = readJson(storage, ENABLED_MODELS_KEY)
		if (!Array.isArray(raw)) {
			return []
		}
		return raw.flatMap((entry) => {
			const model = parseModelSelection(entry)
			if (!model) {
				return []
			}
			return model.provider === "ollama" ||
				API_MODELS_MAP[model.provider].includes(model.model)
				? [model]
				: []
		})
	},
	saveEnabledModels: (models: ModelSelection[]) =>
		storage.setItem(ENABLED_MODELS_KEY, JSON.stringify(models)),
})

const toChatConfig = (
	selection: ModelSelection,
	credential: ProviderCredential | null,
): ChatConfig | null => {
	if (selection.provider === "ollama") {
		return { ...selection, apiKey: "" }
	}
	if (!credential) {
		return null
	}
	return credential.type === "api_key"
		? { ...selection, apiKey: credential.apiKey }
		: {
				...selection,
				apiKey: credential.accessToken,
				accountId: credential.accountId,
			}
}

const sameSelection = (a: ModelSelection | null, b: ModelSelection) =>
	a?.provider === b.provider && a.model === b.model

export const createAISettingsService = (deps: AISettingsDependencies) => {
	const preferences = createModelPreferences(deps.storage)
	const state = createState<AISettingsSnapshot>({
		connectedProviders: [],
		chatConfig: null,
		apiModels: API_MODELS_MAP,
		ollamaCompletionModels: [],
		ollamaEmbeddingModels: [],
		enabledChatModels: preferences.loadEnabledModels(),
	})
	const enqueue = createSerialQueue()
	let loadedCatalog: OllamaModels | null = null
	let catalogRequest: Promise<void> | null = null
	let codexConnectionVersion = 0
	let selectionVersion = 0
	let pendingSelection: ModelSelection | null = null
	const get = state.getSnapshot

	const resolveCredential = async (selection: ModelSelection) => {
		if (selection.provider === "ollama") {
			return null
		}
		pendingSelection = selection
		try {
			return await deps.getCredential(selection.provider)
		} finally {
			pendingSelection = null
		}
	}

	const removeModels = (remove: (selection: ModelSelection) => boolean) => {
		const { chatConfig, enabledChatModels } = get()
		const next = enabledChatModels.filter((model) => !remove(model))
		const update: Partial<AISettingsSnapshot> = {}

		if (next.length !== enabledChatModels.length) {
			preferences.saveEnabledModels(next)
			update.enabledChatModels = next
		}
		const savedSelection = chatConfig ?? preferences.loadSelection()
		if (savedSelection && remove(savedSelection)) {
			preferences.saveSelection(null)
			update.chatConfig = null
		}
		if (pendingSelection && remove(pendingSelection)) {
			selectionVersion += 1
		}
		return update
	}

	const connectCredential = (
		provider: ProviderId,
		credential: ProviderCredential,
	) => {
		const { connectedProviders, chatConfig } = get()
		state.update({
			connectedProviders: connectedProviders.includes(provider)
				? connectedProviders
				: [...connectedProviders, provider],
			chatConfig:
				chatConfig?.provider === provider
					? toChatConfig({ provider, model: chatConfig.model }, credential)
					: chatConfig,
		})
	}

	const disconnect = async (provider: ProviderId) => {
		await deps.deleteCredential(provider)
		state.update({
			connectedProviders: get().connectedProviders.filter(
				(item) => item !== provider,
			),
			...removeModels((selection) => selection.provider === provider),
		})
	}

	const load = async () => {
		const connectedProviders = await deps.listCredentialProviders()
		const selection = preferences.loadSelection()
		const version = selectionVersion
		const credential =
			selection &&
			selection.provider !== "ollama" &&
			connectedProviders.includes(selection.provider)
				? await resolveCredential(selection)
				: null
		const hasModel = ({ provider, model }: ModelSelection) =>
			provider === "ollama"
				? (loadedCatalog?.completionModels.includes(model) ?? true)
				: connectedProviders.includes(provider)
		const patch: Partial<AISettingsSnapshot> = { connectedProviders }

		if (version === selectionVersion) {
			const chatConfig =
				selection && hasModel(selection)
					? toChatConfig(selection, credential)
					: null
			if (!chatConfig) {
				preferences.saveSelection(null)
			}
			patch.chatConfig = chatConfig
		}

		const enabled = preferences.loadEnabledModels()
		const available = enabled.filter(hasModel)
		if (available.length !== enabled.length) {
			preferences.saveEnabledModels(available)
		}
		patch.enabledChatModels = available
		state.update(patch)
	}

	const selectModel = (provider: ChatProviderId, model: string) =>
		enqueue(async () => {
			const available =
				provider === "ollama"
					? get().ollamaCompletionModels
					: API_MODELS_MAP[provider]
			if (!available.includes(model)) {
				return
			}
			const version = selectionVersion
			const selection = { provider, model }
			const credential = await resolveCredential(selection)
			const config = toChatConfig(selection, credential)
			const availableAfterRead =
				provider !== "ollama" || get().ollamaCompletionModels.includes(model)
			if (config && availableAfterRead && version === selectionVersion) {
				preferences.saveSelection(config)
				state.update({ chatConfig: config })
			}
		})

	const toggleModelEnabled = (
		provider: ChatProviderId,
		model: string,
		checked: boolean,
	) => {
		const { enabledChatModels, chatConfig } = get()
		const selection = { provider, model }
		const matching = enabledChatModels.some((item) =>
			sameSelection(item, selection),
		)
		const nextModels = checked
			? matching
				? enabledChatModels
				: [...enabledChatModels, selection]
			: enabledChatModels.filter((item) => !sameSelection(item, selection))
		const update: Partial<AISettingsSnapshot> = {
			enabledChatModels: nextModels,
		}
		if (!checked) {
			if (sameSelection(pendingSelection, selection)) {
				selectionVersion += 1
			}
			if (sameSelection(chatConfig ?? preferences.loadSelection(), selection)) {
				preferences.saveSelection(null)
				update.chatConfig = null
			}
		}
		preferences.saveEnabledModels(nextModels)
		state.update(update)
	}

	const fetchOllamaModels = () => {
		catalogRequest ??= Promise.resolve()
			.then(deps.fetchOllamaModelCatalog)
			.then((catalog) => {
				loadedCatalog = catalog
				state.update({
					ollamaCompletionModels: catalog.completionModels,
					ollamaEmbeddingModels: catalog.embeddingModels,
					...removeModels(
						({ provider, model }) =>
							provider === "ollama" &&
							!catalog.completionModels.includes(model),
					),
				})
			})
			.catch((error) => console.error("Failed to fetch Ollama models:", error))
			.finally(() => {
				catalogRequest = null
			})
		return catalogRequest
	}

	const refreshCodex = async () => {
		if (get().chatConfig?.provider !== "codex_oauth") {
			return
		}
		const stored = await deps.getCredential("codex_oauth")
		if (stored?.type !== "oauth") {
			state.update({
				connectedProviders: get().connectedProviders.filter(
					(item) => item !== "codex_oauth",
				),
				...removeModels((selection) => selection.provider === "codex_oauth"),
			})
			return
		}
		if (!deps.isCodexCredentialExpiringSoon(stored)) {
			connectCredential("codex_oauth", stored)
			return
		}
		try {
			const result = await deps.refreshCodexAccessToken(stored.refreshToken)
			const next: CodexOAuthCredential = {
				type: "oauth",
				...result,
				accountId: result.accountId ?? stored.accountId,
			}
			await deps.setCodexCredential(next)
			connectCredential("codex_oauth", next)
		} catch (error) {
			console.error("Failed to refresh Codex OAuth credential:", error)
			await disconnect("codex_oauth")
		}
	}

	return {
		getSnapshot: state.getSnapshot,
		subscribe: state.subscribe,
		commands: {
			loadAISettings: () => enqueue(load),
			connectProvider: (provider: ApiKeyProviderId, apiKey: string) =>
				enqueue(async () => {
					const normalized = apiKey.trim()
					if (!normalized) {
						return
					}
					await deps.setApiKeyCredential(provider, normalized)
					connectCredential(provider, { type: "api_key", apiKey: normalized })
				}),
			connectCodexOAuth: async () => {
				const version = ++codexConnectionVersion
				const result = await deps.startCodexBrowserOAuth()
				await enqueue(async () => {
					if (version === codexConnectionVersion) {
						const credential: CodexOAuthCredential = {
							type: "oauth",
							...result,
						}
						await deps.setCodexCredential(credential)
						connectCredential("codex_oauth", credential)
					}
				})
			},
			disconnectProvider: (provider: ProviderId) => {
				if (provider === "codex_oauth") {
					codexConnectionVersion += 1
				}
				return enqueue(() => disconnect(provider))
			},
			refreshCodexOAuthForTarget: () => enqueue(refreshCodex),
			fetchOllamaModels,
			selectModel,
			toggleModelEnabled,
		},
	}
}
