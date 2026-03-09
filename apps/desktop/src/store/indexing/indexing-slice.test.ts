import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import { createTauriIndexingPort, type InvokeFunction } from "./indexing-ports"
import { type IndexingSlice, prepareIndexingSlice } from "./indexing-slice"

type TestStoreState = IndexingSlice & { ollamaEmbeddingModels: string[] }
type ConfigResolver = (value: {
	embeddingProvider: string
	embeddingModel: string
}) => void

function createIndexingStore({
	invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction,
	ollamaEmbeddingModels = [],
}: {
	invoke?: InvokeFunction
	ollamaEmbeddingModels?: string[]
} = {}) {
	const createSlice = prepareIndexingSlice({
		createIndexingPort: (workspacePath) =>
			createTauriIndexingPort(invoke, workspacePath),
	})

	const store = createStore<TestStoreState>()((set, get, api) => ({
		ollamaEmbeddingModels,
		...createSlice(set, get, api),
	}))

	return { store, invoke }
}

describe("indexing-slice config", () => {
	it("loads embedding config from vault command", async () => {
		const invoke = vi.fn().mockImplementation((command: string) => {
			if (command === "get_vault_embedding_config_command") {
				return Promise.resolve({
					embeddingProvider: "ollama",
					embeddingModel: "mxbai-embed-large",
				})
			}
			return Promise.resolve({})
		}) as unknown as InvokeFunction
		const { store } = createIndexingStore({
			invoke,
		})

		const config = await store.getState().getIndexingConfig("/ws")

		expect(config).toEqual({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
		expect(store.getState().config).toEqual({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
		expect(invoke).toHaveBeenCalledWith("get_vault_embedding_config_command", {
			workspacePath: "/ws",
		})
	})

	it("persists embedding config via vault command", async () => {
		const invoke = vi
			.fn()
			.mockResolvedValue(undefined) as unknown as InvokeFunction
		const { store } = createIndexingStore({
			invoke,
		})

		await store
			.getState()
			.setIndexingConfig("/ws", "ollama", "mxbai-embed-large")

		expect(invoke).toHaveBeenCalledWith("set_vault_embedding_config_command", {
			workspacePath: "/ws",
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
		expect(store.getState().config).toEqual({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
	})

	it("ignores late config responses after reset", async () => {
		let resolveConfig: ConfigResolver | undefined
		const invoke = vi.fn().mockImplementation((command: string) => {
			if (command === "get_vault_embedding_config_command") {
				return new Promise<{
					embeddingProvider: string
					embeddingModel: string
				}>((resolve) => {
					resolveConfig = resolve
				})
			}
			return Promise.resolve({})
		}) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })

		const configPromise = store.getState().getIndexingConfig("/ws")
		store.getState().resetIndexingState()
		resolveConfig?.({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})

		await expect(configPromise).resolves.toEqual({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
		expect(store.getState().config).toBeNull()
	})
})

describe("indexing-slice indexVaultDocuments", () => {
	it("sends expected invoke payload for vault document indexing", async () => {
		const invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })

		await store.getState().indexVaultDocuments("/ws", true)

		expect(invoke).toHaveBeenCalledWith("index_vault_documents_command", {
			workspacePath: "/ws",
			forceReindex: true,
		})
		expect(store.getState().isIndexing).toBe(false)
	})

	it("sends expected invoke payload for embedding-only workspace refresh", async () => {
		const invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })

		await store.getState().refreshWorkspaceEmbeddings("/ws")

		expect(invoke).toHaveBeenCalledWith(
			"refresh_workspace_embeddings_command",
			{
				workspacePath: "/ws",
			},
		)
		expect(store.getState().isIndexing).toBe(false)
	})

	it("resetIndexingState clears current workspace state", () => {
		const { store } = createIndexingStore()

		store.setState({
			config: {
				embeddingProvider: "ollama",
				embeddingModel: "mxbai-embed-large",
			},
			isIndexing: true,
			indexedDocCount: 42,
			isMetaLoading: true,
		})

		store.getState().resetIndexingState()

		expect(store.getState().config).toBeNull()
		expect(store.getState().isIndexing).toBe(false)
		expect(store.getState().indexedDocCount).toBe(0)
		expect(store.getState().isMetaLoading).toBe(false)
	})
})
