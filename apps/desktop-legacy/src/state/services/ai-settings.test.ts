import type { ProviderId } from "@mdit/ai"
import { describe, expect, it, vi } from "vitest"
import {
	type BrowserStorageLike,
	type CodexOAuthCredential,
	createAISettingsService,
} from "./ai-settings"

type CredentialsMap = Partial<
	Record<ProviderId, { type: "api_key"; apiKey: string } | CodexOAuthCredential>
>

function createMemoryStorage() {
	const values = new Map<string, string>()

	return {
		storage: {
			getItem: (key) => values.get(key) ?? null,
			setItem: (key, value) => {
				values.set(key, String(value))
			},
			removeItem: (key) => {
				values.delete(key)
			},
		} satisfies BrowserStorageLike,
	}
}

function createAISettingsTestStore({
	initialCredentials = {},
	initialStorage = {},
	refreshResult = {
		accessToken: "next-access",
		refreshToken: "next-refresh",
		expiresAt: Date.now() + 1000 * 60 * 60,
		accountId: "org-next",
	},
	isCodexCredentialExpiringSoon = () => false,
}: {
	initialCredentials?: CredentialsMap
	initialStorage?: Record<string, string>
	refreshResult?: {
		accessToken: string
		refreshToken: string
		expiresAt: number
		accountId?: string
	}
	isCodexCredentialExpiringSoon?: (
		credential: Pick<CodexOAuthCredential, "expiresAt">,
	) => boolean
} = {}) {
	const credentials: CredentialsMap = { ...initialCredentials }
	const { storage } = createMemoryStorage()

	for (const [key, value] of Object.entries(initialStorage)) {
		storage.setItem(key, value)
	}

	const deps = {
		storage,
		fetchOllamaModelCatalog: vi.fn().mockResolvedValue({
			completionModels: ["llama3.2"],
			embeddingModels: ["mxbai-embed-large"],
		}),
		listCredentialProviders: vi.fn(
			async () => Object.keys(credentials) as ProviderId[],
		),
		getCredential: vi.fn(async (provider: ProviderId) => {
			return credentials[provider] ?? null
		}),
		setApiKeyCredential: vi.fn(
			async (provider: Exclude<ProviderId, "codex_oauth">, apiKey: string) => {
				credentials[provider] = { type: "api_key", apiKey }
			},
		),
		setCodexCredential: vi.fn(async (credential: CodexOAuthCredential) => {
			credentials.codex_oauth = credential
		}),
		deleteCredential: vi.fn(async (provider: ProviderId) => {
			delete credentials[provider]
		}),
		startCodexBrowserOAuth: vi.fn().mockResolvedValue({
			accessToken: "oauth-access",
			refreshToken: "oauth-refresh",
			expiresAt: Date.now() + 1000 * 60 * 60,
			accountId: "org-start",
		}),
		refreshCodexAccessToken: vi.fn().mockResolvedValue(refreshResult),
		isCodexCredentialExpiringSoon,
	}

	const store = createAISettingsService(deps)

	return {
		store,
		deps,
		credentials,
		storage,
	}
}

describe("AI settings service credential store", () => {
	it("merges api key providers into a single credential store", async () => {
		const { store, credentials } = createAISettingsTestStore()

		await store.commands.connectProvider("openai", "sk-openai")
		await store.commands.connectProvider("google", "sk-google")

		expect(credentials).toMatchObject({
			openai: { type: "api_key", apiKey: "sk-openai" },
			google: { type: "api_key", apiKey: "sk-google" },
		})
		expect(store.getSnapshot().connectedProviders).toEqual(["openai", "google"])
	})

	it("removes only the disconnected provider and deletes last credential", async () => {
		const { store, credentials } = createAISettingsTestStore()

		await store.commands.connectProvider("openai", "sk-openai")
		await store.commands.connectProvider("google", "sk-google")

		await store.commands.disconnectProvider("openai")
		expect(credentials.openai).toBeUndefined()
		expect(credentials.google).toEqual({
			type: "api_key",
			apiKey: "sk-google",
		})

		await store.commands.disconnectProvider("google")
		expect(Object.keys(credentials)).toHaveLength(0)
		expect(store.getSnapshot().connectedProviders).toEqual([])
	})
})

describe("AI settings service persistence", () => {
	it("stores gpt-5.4 chat config without persisting apiKey", async () => {
		const { store, storage } = createAISettingsTestStore({
			initialCredentials: {
				openai: { type: "api_key", apiKey: "openai-secret" },
			},
		})

		await store.commands.loadAISettings()
		await store.commands.selectModel("openai", "gpt-5.4")

		expect(JSON.parse(storage.getItem("chat-config") || "{}")).toEqual({
			provider: "openai",
			model: "gpt-5.4",
		})

		expect(store.getSnapshot().chatConfig).toEqual({
			provider: "openai",
			model: "gpt-5.4",
			apiKey: "openai-secret",
		})
	})

	it("hydrates from credential store and clears stale persisted values", async () => {
		const { store, storage } = createAISettingsTestStore({
			initialCredentials: {
				openai: { type: "api_key", apiKey: "openai-secret" },
				codex_oauth: {
					type: "oauth",
					accessToken: "codex-access",
					refreshToken: "codex-refresh",
					expiresAt: Date.now() + 1000 * 60 * 60,
					accountId: "org-codex",
				},
			},
			initialStorage: {
				"chat-config": JSON.stringify({
					provider: "openai",
					model: "gpt-5.4",
				}),
				"chat-enabled-models": JSON.stringify([
					{ provider: "openai", model: "gpt-5.4" },
					{ provider: "codex_oauth", model: "gpt-5.4" },
					{ provider: "anthropic", model: "claude-sonnet-4-5" },
					{ provider: "ollama", model: "llama3.2" },
					{ provider: "openai", model: "stale-model" },
				]),
			},
		})

		await store.commands.loadAISettings()

		expect(store.getSnapshot().connectedProviders).toEqual([
			"openai",
			"codex_oauth",
		])
		expect(store.getSnapshot().chatConfig).toEqual({
			provider: "openai",
			model: "gpt-5.4",
			apiKey: "openai-secret",
		})
		expect(store.getSnapshot().enabledChatModels).toEqual([
			{ provider: "openai", model: "gpt-5.4" },
			{ provider: "codex_oauth", model: "gpt-5.4" },
			{ provider: "ollama", model: "llama3.2" },
		])
		expect(JSON.parse(storage.getItem("chat-enabled-models") || "[]")).toEqual([
			{ provider: "openai", model: "gpt-5.4" },
			{ provider: "codex_oauth", model: "gpt-5.4" },
			{ provider: "ollama", model: "llama3.2" },
		])
	})

	it("hydrates ollama completion and embedding models from fetch", async () => {
		const { store } = createAISettingsTestStore()

		await store.commands.fetchOllamaModels()

		expect(store.getSnapshot().ollamaCompletionModels).toEqual(["llama3.2"])
		expect(store.getSnapshot().ollamaEmbeddingModels).toEqual([
			"mxbai-embed-large",
		])
	})

	it("removes invalid persisted ollama models after fetch", async () => {
		const { store, storage } = createAISettingsTestStore({
			initialStorage: {
				"chat-config": JSON.stringify({
					provider: "ollama",
					model: "old-model",
				}),
				"chat-enabled-models": JSON.stringify([
					{ provider: "ollama", model: "old-model" },
					{ provider: "ollama", model: "llama3.2" },
				]),
			},
		})

		await store.commands.loadAISettings()
		await store.commands.fetchOllamaModels()

		expect(store.getSnapshot().chatConfig).toBeNull()
		expect(store.getSnapshot().enabledChatModels).toEqual([
			{ provider: "ollama", model: "llama3.2" },
		])
		expect(storage.getItem("chat-config")).toBeNull()
		expect(JSON.parse(storage.getItem("chat-enabled-models") || "[]")).toEqual([
			{ provider: "ollama", model: "llama3.2" },
		])
	})

	it("keeps persisted ollama selections when model fetch fails", async () => {
		const { store, deps, storage } = createAISettingsTestStore({
			initialStorage: {
				"chat-config": JSON.stringify({
					provider: "ollama",
					model: "old-model",
				}),
				"chat-enabled-models": JSON.stringify([
					{ provider: "ollama", model: "old-model" },
					{ provider: "ollama", model: "llama3.2" },
				]),
			},
		})
		await store.commands.loadAISettings()
		deps.fetchOllamaModelCatalog.mockRejectedValueOnce(
			new Error("ollama unavailable"),
		)

		await store.commands.fetchOllamaModels()

		expect(store.getSnapshot().chatConfig).toEqual({
			provider: "ollama",
			model: "old-model",
			apiKey: "",
		})
		expect(store.getSnapshot().enabledChatModels).toEqual([
			{ provider: "ollama", model: "old-model" },
			{ provider: "ollama", model: "llama3.2" },
		])
		expect(JSON.parse(storage.getItem("chat-config") || "{}")).toEqual({
			provider: "ollama",
			model: "old-model",
		})
		expect(JSON.parse(storage.getItem("chat-enabled-models") || "[]")).toEqual([
			{ provider: "ollama", model: "old-model" },
			{ provider: "ollama", model: "llama3.2" },
		])
	})

	it("clears persisted ollama selections when fetch succeeds with no models", async () => {
		const { store, deps, storage } = createAISettingsTestStore({
			initialStorage: {
				"chat-config": JSON.stringify({
					provider: "ollama",
					model: "old-model",
				}),
				"chat-enabled-models": JSON.stringify([
					{ provider: "ollama", model: "old-model" },
				]),
			},
		})
		await store.commands.loadAISettings()
		deps.fetchOllamaModelCatalog.mockResolvedValueOnce({
			completionModels: [],
			embeddingModels: [],
		})

		await store.commands.fetchOllamaModels()

		expect(store.getSnapshot().chatConfig).toBeNull()
		expect(store.getSnapshot().enabledChatModels).toEqual([])
		expect(storage.getItem("chat-config")).toBeNull()
		expect(JSON.parse(storage.getItem("chat-enabled-models") || "[]")).toEqual(
			[],
		)
	})
})

describe("AI settings service codex refresh", () => {
	it("refreshes codex oauth when expiring soon", async () => {
		const isCodexCredentialExpiringSoon = vi
			.fn<(credential: Pick<CodexOAuthCredential, "expiresAt">) => boolean>()
			.mockReturnValue(true)
		const { store, deps, credentials } = createAISettingsTestStore({
			initialCredentials: {
				codex_oauth: {
					type: "oauth",
					accessToken: "old-access",
					refreshToken: "old-refresh",
					expiresAt: Date.now() + 10,
					accountId: "org-old",
				},
			},
			initialStorage: {
				"chat-config": JSON.stringify({
					provider: "codex_oauth",
					model: "gpt-5.2-codex",
				}),
			},
			isCodexCredentialExpiringSoon,
			refreshResult: {
				accessToken: "new-access",
				refreshToken: "new-refresh",
				expiresAt: Date.now() + 1000 * 60 * 60,
				accountId: "org-new",
			},
		})

		await store.commands.loadAISettings()
		await store.commands.refreshCodexOAuthForTarget()

		expect(deps.refreshCodexAccessToken).toHaveBeenCalledWith("old-refresh")
		expect(credentials.codex_oauth).toEqual({
			type: "oauth",
			accessToken: "new-access",
			refreshToken: "new-refresh",
			expiresAt: expect.any(Number),
			accountId: "org-new",
		})
		expect(store.getSnapshot().chatConfig?.apiKey).toBe("new-access")
		expect(store.getSnapshot().chatConfig?.accountId).toBe("org-new")
	})

	it("skips codex refresh when credential is not expiring", async () => {
		const isCodexCredentialExpiringSoon = vi
			.fn<(credential: Pick<CodexOAuthCredential, "expiresAt">) => boolean>()
			.mockReturnValue(false)
		const { store, deps } = createAISettingsTestStore({
			initialCredentials: {
				codex_oauth: {
					type: "oauth",
					accessToken: "stable-access",
					refreshToken: "stable-refresh",
					expiresAt: Date.now() + 1000 * 60 * 60,
					accountId: "org-stable",
				},
			},
			initialStorage: {
				"chat-config": JSON.stringify({
					provider: "codex_oauth",
					model: "gpt-5.2-codex",
				}),
			},
			isCodexCredentialExpiringSoon,
		})

		await store.commands.loadAISettings()
		await store.commands.refreshCodexOAuthForTarget()

		expect(deps.refreshCodexAccessToken).not.toHaveBeenCalled()
		expect(store.getSnapshot().chatConfig?.apiKey).toBe("stable-access")
	})
})
