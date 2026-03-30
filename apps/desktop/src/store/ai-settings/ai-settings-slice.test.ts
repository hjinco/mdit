import type { ProviderId } from "@mdit/ai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import type { CodexOAuthCredential } from "@/lib/credentials"
import {
	type AISettingsSlice,
	prepareAISettingsSlice,
} from "./ai-settings-slice"

type LocalStorageLike = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem" | "clear" | "key"
> & {
	length: number
}

const ensureLocalStorage = () => {
	if (typeof globalThis.localStorage !== "undefined") return

	const store = new Map<string, string>()
	const localStorageShim: LocalStorageLike = {
		getItem: (key) => (store.has(key) ? store.get(key)! : null),
		setItem: (key, value) => {
			store.set(key, String(value))
		},
		removeItem: (key) => {
			store.delete(key)
		},
		clear: () => {
			store.clear()
		},
		key: (index) => Array.from(store.keys())[index] ?? null,
		get length() {
			return store.size
		},
	}

	globalThis.localStorage = localStorageShim as Storage
}

type CredentialsMap = Partial<
	Record<ProviderId, { type: "api_key"; apiKey: string } | CodexOAuthCredential>
>

function createAISettingsTestStore({
	initialCredentials = {},
	refreshResult = {
		accessToken: "next-access",
		refreshToken: "next-refresh",
		expiresAt: Date.now() + 1000 * 60 * 60,
		accountId: "org-next",
	},
	isCodexCredentialExpiringSoon = () => false,
}: {
	initialCredentials?: CredentialsMap
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

	const deps = {
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

	const createSlice = prepareAISettingsSlice(deps)
	const store = createStore<AISettingsSlice>()((set, get, api) =>
		createSlice(set, get, api),
	)

	return {
		store,
		deps,
		credentials,
	}
}

beforeEach(() => {
	ensureLocalStorage()
	localStorage.clear()
})

describe("ai-settings-slice credential store", () => {
	it("merges api key providers into a single credential store", async () => {
		const { store, credentials } = createAISettingsTestStore()

		await store.getState().connectProvider("openai", "sk-openai")
		await store.getState().connectProvider("google", "sk-google")

		expect(credentials).toMatchObject({
			openai: { type: "api_key", apiKey: "sk-openai" },
			google: { type: "api_key", apiKey: "sk-google" },
		})
		expect(store.getState().connectedProviders).toEqual(["openai", "google"])
	})

	it("removes only the disconnected provider and deletes last credential", async () => {
		const { store, credentials } = createAISettingsTestStore()

		await store.getState().connectProvider("openai", "sk-openai")
		await store.getState().connectProvider("google", "sk-google")

		await store.getState().disconnectProvider("openai")
		expect(credentials.openai).toBeUndefined()
		expect(credentials.google).toEqual({
			type: "api_key",
			apiKey: "sk-google",
		})

		await store.getState().disconnectProvider("google")
		expect(Object.keys(credentials)).toHaveLength(0)
		expect(store.getState().connectedProviders).toEqual([])
	})
})

describe("ai-settings-slice persistence", () => {
	it("stores gpt-5.4 chat config in localStorage without apiKey", async () => {
		const { store } = createAISettingsTestStore({
			initialCredentials: {
				openai: { type: "api_key", apiKey: "openai-secret" },
			},
		})

		await store.getState().initializeAISettings()
		await store.getState().selectModel("openai", "gpt-5.4")

		expect(JSON.parse(localStorage.getItem("chat-config") || "{}")).toEqual({
			provider: "openai",
			model: "gpt-5.4",
		})

		expect(store.getState().chatConfig).toEqual({
			provider: "openai",
			model: "gpt-5.4",
			apiKey: "openai-secret",
		})
	})

	it("hydrates from credential store and clears stale persisted values", async () => {
		localStorage.setItem(
			"chat-config",
			JSON.stringify({ provider: "openai", model: "gpt-5.4" }),
		)
		localStorage.setItem(
			"chat-enabled-models",
			JSON.stringify([
				{ provider: "openai", model: "gpt-5.4" },
				{ provider: "codex_oauth", model: "gpt-5.4" },
				{ provider: "anthropic", model: "claude-sonnet-4-5" },
				{ provider: "ollama", model: "llama3.2" },
				{ provider: "openai", model: "stale-model" },
			]),
		)

		const { store } = createAISettingsTestStore({
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
		})

		await store.getState().initializeAISettings()

		expect(store.getState().connectedProviders).toEqual([
			"openai",
			"codex_oauth",
		])
		expect(store.getState().chatConfig).toEqual({
			provider: "openai",
			model: "gpt-5.4",
			apiKey: "openai-secret",
		})
		expect(store.getState().enabledChatModels).toEqual([
			{ provider: "openai", model: "gpt-5.4" },
			{ provider: "codex_oauth", model: "gpt-5.4" },
			{ provider: "ollama", model: "llama3.2" },
		])
		expect(
			JSON.parse(localStorage.getItem("chat-enabled-models") || "[]"),
		).toEqual([
			{ provider: "openai", model: "gpt-5.4" },
			{ provider: "codex_oauth", model: "gpt-5.4" },
			{ provider: "ollama", model: "llama3.2" },
		])
	})

	it("hydrates ollama completion and embedding models from fetch", async () => {
		const { store } = createAISettingsTestStore()

		await store.getState().fetchOllamaModels()

		expect(store.getState().ollamaCompletionModels).toEqual(["llama3.2"])
		expect(store.getState().ollamaEmbeddingModels).toEqual([
			"mxbai-embed-large",
		])
	})

	it("removes invalid persisted ollama models after fetch", async () => {
		localStorage.setItem(
			"chat-config",
			JSON.stringify({ provider: "ollama", model: "old-model" }),
		)
		localStorage.setItem(
			"chat-enabled-models",
			JSON.stringify([
				{ provider: "ollama", model: "old-model" },
				{ provider: "ollama", model: "llama3.2" },
			]),
		)

		const { store } = createAISettingsTestStore()
		await store.getState().initializeAISettings()
		await store.getState().fetchOllamaModels()

		expect(store.getState().chatConfig).toBeNull()
		expect(store.getState().enabledChatModels).toEqual([
			{ provider: "ollama", model: "llama3.2" },
		])
		expect(localStorage.getItem("chat-config")).toBeNull()
		expect(
			JSON.parse(localStorage.getItem("chat-enabled-models") || "[]"),
		).toEqual([{ provider: "ollama", model: "llama3.2" }])
	})

	it("keeps persisted ollama selections when model fetch fails", async () => {
		localStorage.setItem(
			"chat-config",
			JSON.stringify({ provider: "ollama", model: "old-model" }),
		)
		localStorage.setItem(
			"chat-enabled-models",
			JSON.stringify([
				{ provider: "ollama", model: "old-model" },
				{ provider: "ollama", model: "llama3.2" },
			]),
		)

		const { store, deps } = createAISettingsTestStore()
		await store.getState().initializeAISettings()
		deps.fetchOllamaModelCatalog.mockRejectedValueOnce(
			new Error("ollama unavailable"),
		)

		await store.getState().fetchOllamaModels()

		expect(store.getState().chatConfig).toEqual({
			provider: "ollama",
			model: "old-model",
			apiKey: "",
		})
		expect(store.getState().enabledChatModels).toEqual([
			{ provider: "ollama", model: "old-model" },
			{ provider: "ollama", model: "llama3.2" },
		])
		expect(JSON.parse(localStorage.getItem("chat-config") || "{}")).toEqual({
			provider: "ollama",
			model: "old-model",
		})
		expect(
			JSON.parse(localStorage.getItem("chat-enabled-models") || "[]"),
		).toEqual([
			{ provider: "ollama", model: "old-model" },
			{ provider: "ollama", model: "llama3.2" },
		])
	})

	it("clears persisted ollama selections when fetch succeeds with no models", async () => {
		localStorage.setItem(
			"chat-config",
			JSON.stringify({ provider: "ollama", model: "old-model" }),
		)
		localStorage.setItem(
			"chat-enabled-models",
			JSON.stringify([{ provider: "ollama", model: "old-model" }]),
		)

		const { store, deps } = createAISettingsTestStore()
		await store.getState().initializeAISettings()
		deps.fetchOllamaModelCatalog.mockResolvedValueOnce({
			completionModels: [],
			embeddingModels: [],
		})

		await store.getState().fetchOllamaModels()

		expect(store.getState().chatConfig).toBeNull()
		expect(store.getState().enabledChatModels).toEqual([])
		expect(localStorage.getItem("chat-config")).toBeNull()
		expect(
			JSON.parse(localStorage.getItem("chat-enabled-models") || "[]"),
		).toEqual([])
	})
})

describe("ai-settings-slice codex refresh", () => {
	it("refreshes codex oauth when expiring soon", async () => {
		localStorage.setItem(
			"chat-config",
			JSON.stringify({ provider: "codex_oauth", model: "gpt-5.2-codex" }),
		)

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
			isCodexCredentialExpiringSoon,
			refreshResult: {
				accessToken: "new-access",
				refreshToken: "new-refresh",
				expiresAt: Date.now() + 1000 * 60 * 60,
				accountId: "org-new",
			},
		})

		await store.getState().initializeAISettings()
		await store.getState().refreshCodexOAuthForTarget()

		expect(deps.refreshCodexAccessToken).toHaveBeenCalledWith("old-refresh")
		expect(credentials.codex_oauth).toEqual({
			type: "oauth",
			accessToken: "new-access",
			refreshToken: "new-refresh",
			expiresAt: expect.any(Number),
			accountId: "org-new",
		})
		expect(store.getState().chatConfig?.apiKey).toBe("new-access")
		expect(store.getState().chatConfig?.accountId).toBe("org-new")
	})

	it("skips codex refresh when credential is not expiring", async () => {
		localStorage.setItem(
			"chat-config",
			JSON.stringify({ provider: "codex_oauth", model: "gpt-5.2-codex" }),
		)

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
			isCodexCredentialExpiringSoon,
		})

		await store.getState().initializeAISettings()
		await store.getState().refreshCodexOAuthForTarget()

		expect(deps.refreshCodexAccessToken).not.toHaveBeenCalled()
		expect(store.getState().chatConfig?.apiKey).toBe("stable-access")
	})
})
