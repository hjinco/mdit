import { describe, expect, it, vi } from "vitest"
import { createIndexingService, type IndexingPort } from "./indexing"

type ConfigResolver = (value: {
	embeddingProvider: string
	embeddingModel: string
}) => void

function createIndexingStore({
	createIndexingPort,
}: {
	createIndexingPort?: (workspacePath: string) => IndexingPort
} = {}) {
	const store = createIndexingService({
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
	store.commands.setWorkspace("/ws")
	return { store }
}

describe("indexing service config", () => {
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

		const config = await store.commands.getIndexingConfig("/ws")

		expect(config).toEqual({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
		expect(store.getSnapshot().config).toEqual({
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

		await store.commands.setIndexingConfig("/ws", "ollama", "mxbai-embed-large")

		expect(setIndexingConfig).toHaveBeenCalledWith(
			"ollama",
			"mxbai-embed-large",
		)
		expect(store.getSnapshot().config).toEqual({
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

		const configPromise = store.commands.getIndexingConfig("/ws")
		store.commands.resetIndexingState()
		resolveConfig?.({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})

		await expect(configPromise).resolves.toEqual({
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
		expect(store.getSnapshot().config).toBeNull()
	})

	it("updates the reopened workspace when a pending configuration write completes", async () => {
		let finishWrite!: () => void
		const setIndexingConfig = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishWrite = resolve
				}),
		)
		const { store } = createIndexingStore({
			createIndexingPort: () => ({
				getIndexingMeta: vi.fn().mockResolvedValue({ indexedDocCount: 0 }),
				getIndexingConfig: vi.fn().mockResolvedValue({
					embeddingProvider: "ollama",
					embeddingModel: "previous-model",
				}),
				setIndexingConfig,
				indexVaultDocuments: vi.fn().mockResolvedValue({}),
				refreshWorkspaceEmbeddings: vi.fn().mockResolvedValue({}),
			}),
		})
		const write = store.commands.setIndexingConfig(
			"/ws",
			"ollama",
			"next-model",
		)
		await vi.waitFor(() => expect(setIndexingConfig).toHaveBeenCalledTimes(1))
		store.commands.setWorkspace(null)
		store.commands.setWorkspace("/ws")
		await store.commands.getIndexingConfig("/ws")
		finishWrite()
		await write

		expect(store.getSnapshot().config?.embeddingModel).toBe("next-model")
	})
})

describe("indexing service indexVaultDocuments", () => {
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

		await store.commands.indexVaultDocuments("/ws", true)

		expect(indexVaultDocuments).toHaveBeenCalledWith(true)
		expect(store.getSnapshot().isIndexing).toBe(false)
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

		await store.commands.refreshWorkspaceEmbeddings("/ws")

		expect(refreshWorkspaceEmbeddings).toHaveBeenCalledTimes(1)
		expect(store.getSnapshot().isIndexing).toBe(false)
	})

	it("resetIndexingState clears current workspace state", async () => {
		const { store } = createIndexingStore()

		await store.commands.setIndexingConfig("/ws", "ollama", "mxbai-embed-large")
		store.commands.resetIndexingState()
		expect(store.getSnapshot()).toEqual({
			config: null,
			isIndexing: false,
			indexedDocCount: 0,
			isMetaLoading: false,
		})
	})
})
