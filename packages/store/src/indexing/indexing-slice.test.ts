import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import type { IndexingPort } from "./indexing-ports"
import { type IndexingSlice, prepareIndexingSlice } from "./indexing-slice"

type TestStoreState = IndexingSlice & { ollamaEmbeddingModels: string[] }
type ConfigResolver = (value: {
	embeddingProvider: string
	embeddingModel: string
}) => void

function createIndexingStore({
	createIndexingPort,
	ollamaEmbeddingModels = [],
}: {
	createIndexingPort?: (workspacePath: string) => IndexingPort
	ollamaEmbeddingModels?: string[]
} = {}) {
	const createSlice = prepareIndexingSlice({
		createIndexingPort:
			createIndexingPort ??
			(() => ({
				getIndexingMeta: vi.fn().mockResolvedValue({ indexedDocCount: 0 }),
				getIndexingConfig: vi.fn().mockResolvedValue(null),
				setIndexingConfig: vi.fn().mockResolvedValue(undefined),
				indexVaultDocuments: vi.fn().mockResolvedValue({}),
				refreshWorkspaceEmbeddings: vi.fn().mockResolvedValue({}),
			})),
	})

	const store = createStore<TestStoreState>()((set, get, api) => ({
		ollamaEmbeddingModels,
		...createSlice(set, get, api),
	}))

	return { store }
}

describe("indexing-slice config", () => {
	it("loads embedding config from vault command", async () => {
		const getIndexingConfig = vi.fn().mockResolvedValue({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
		const { store } = createIndexingStore({
			createIndexingPort: () =>
				({
					getIndexingMeta: vi.fn().mockResolvedValue({ indexedDocCount: 0 }),
					getIndexingConfig,
					setIndexingConfig: vi.fn().mockResolvedValue(undefined),
					indexVaultDocuments: vi.fn().mockResolvedValue({}),
					refreshWorkspaceEmbeddings: vi.fn().mockResolvedValue({}),
				}) satisfies IndexingPort,
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
		expect(getIndexingConfig).toHaveBeenCalledTimes(1)
	})

	it("persists embedding config via vault command", async () => {
		const setIndexingConfig = vi.fn().mockResolvedValue(undefined)
		const { store } = createIndexingStore({
			createIndexingPort: () =>
				({
					getIndexingMeta: vi.fn().mockResolvedValue({ indexedDocCount: 0 }),
					getIndexingConfig: vi.fn().mockResolvedValue(null),
					setIndexingConfig,
					indexVaultDocuments: vi.fn().mockResolvedValue({}),
					refreshWorkspaceEmbeddings: vi.fn().mockResolvedValue({}),
				}) satisfies IndexingPort,
		})

		await store
			.getState()
			.setIndexingConfig("/ws", "ollama", "mxbai-embed-large")

		expect(setIndexingConfig).toHaveBeenCalledWith(
			"ollama",
			"mxbai-embed-large",
		)
		expect(store.getState().config).toEqual({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
	})

	it("ignores late config responses after reset", async () => {
		let resolveConfig: ConfigResolver | undefined
		const { store } = createIndexingStore({
			createIndexingPort: () =>
				({
					getIndexingMeta: vi.fn().mockResolvedValue({ indexedDocCount: 0 }),
					getIndexingConfig: vi.fn().mockImplementation(
						() =>
							new Promise<{
								embeddingProvider: string
								embeddingModel: string
							}>((resolve) => {
								resolveConfig = resolve
							}),
					),
					setIndexingConfig: vi.fn().mockResolvedValue(undefined),
					indexVaultDocuments: vi.fn().mockResolvedValue({}),
					refreshWorkspaceEmbeddings: vi.fn().mockResolvedValue({}),
				}) satisfies IndexingPort,
		})

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
		const indexVaultDocuments = vi.fn().mockResolvedValue({})
		const { store } = createIndexingStore({
			createIndexingPort: () =>
				({
					getIndexingMeta: vi.fn().mockResolvedValue({ indexedDocCount: 0 }),
					getIndexingConfig: vi.fn().mockResolvedValue(null),
					setIndexingConfig: vi.fn().mockResolvedValue(undefined),
					indexVaultDocuments,
					refreshWorkspaceEmbeddings: vi.fn().mockResolvedValue({}),
				}) satisfies IndexingPort,
		})

		await store.getState().indexVaultDocuments("/ws", true)

		expect(indexVaultDocuments).toHaveBeenCalledWith(true)
		expect(store.getState().isIndexing).toBe(false)
	})

	it("sends expected invoke payload for embedding-only workspace refresh", async () => {
		const refreshWorkspaceEmbeddings = vi.fn().mockResolvedValue({})
		const { store } = createIndexingStore({
			createIndexingPort: () =>
				({
					getIndexingMeta: vi.fn().mockResolvedValue({ indexedDocCount: 0 }),
					getIndexingConfig: vi.fn().mockResolvedValue(null),
					setIndexingConfig: vi.fn().mockResolvedValue(undefined),
					indexVaultDocuments: vi.fn().mockResolvedValue({}),
					refreshWorkspaceEmbeddings,
				}) satisfies IndexingPort,
		})

		await store.getState().refreshWorkspaceEmbeddings("/ws")

		expect(refreshWorkspaceEmbeddings).toHaveBeenCalledTimes(1)
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
