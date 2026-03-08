import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import { createTauriIndexingPort, type InvokeFunction } from "./indexing-ports"
import { type IndexingSlice, prepareIndexingSlice } from "./indexing-slice"

type TestStoreState = IndexingSlice & { ollamaEmbeddingModels: string[] }

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
		timerUtils: {
			setInterval: vi.fn().mockReturnValue(1),
			clearInterval: vi.fn(),
			Date,
		},
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
		expect(store.getState().configs["/ws"]).toEqual({
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
		expect(store.getState().configs["/ws"]).toEqual({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
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
		expect(store.getState().indexingState["/ws"]).toBe(false)
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
		expect(store.getState().indexingState["/ws"]).toBe(false)
	})

	it("reindexes after model confirmation without forcing a full reset", async () => {
		const invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })

		store.setState({
			pendingModelChange: {
				provider: "ollama",
				model: "mxbai-embed-large",
			},
		})

		await store.getState().confirmModelChange("/ws", true)

		expect(invoke).toHaveBeenNthCalledWith(
			1,
			"set_vault_embedding_config_command",
			{
				workspacePath: "/ws",
				embeddingProvider: "ollama",
				embeddingModel: "mxbai-embed-large",
			},
		)
		expect(invoke).toHaveBeenNthCalledWith(
			2,
			"refresh_workspace_embeddings_command",
			{
				workspacePath: "/ws",
			},
		)
		expect(invoke).toHaveBeenNthCalledWith(3, "get_indexing_meta_command", {
			workspacePath: "/ws",
		})
		expect(store.getState().showModelChangeDialog).toBe(false)
		expect(store.getState().pendingModelChange).toBeNull()
	})
})
