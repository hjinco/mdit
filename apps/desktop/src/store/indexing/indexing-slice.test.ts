import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import {
	IndexingService,
	type InvokeFunction,
} from "@/services/indexing-service"
import { type IndexingSlice, prepareIndexingSlice } from "./indexing-slice"

type TestStoreState = IndexingSlice & { ollamaModels: string[] }

function createIndexingStore({
	invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction,
	ollamaModels = [],
}: {
	invoke?: InvokeFunction
	ollamaModels?: string[]
} = {}) {
	const createSlice = prepareIndexingSlice({
		invoke,
		createIndexingService: (invokeFn, workspacePath) =>
			new IndexingService(invokeFn, workspacePath),
		timerUtils: {
			setInterval: vi.fn().mockReturnValue(1),
			clearInterval: vi.fn(),
			Date,
		},
	})

	const store = createStore<TestStoreState>()((set, get, api) => ({
		ollamaModels,
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

describe("indexing-slice indexNote", () => {
	it("skips new note indexing request when workspace indexing is already running", async () => {
		let resolveInvoke: (() => void) | undefined
		const invoke = vi.fn().mockImplementation(
			() =>
				new Promise<unknown>((resolve) => {
					resolveInvoke = () => resolve({})
				}),
		) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })

		const firstRequest = store.getState().indexNote("/ws", "/ws/a.md")

		const skipped = await store.getState().indexNote("/ws", "/ws/b.md")

		expect(skipped).toBe(false)
		expect(invoke).toHaveBeenCalledTimes(1)

		resolveInvoke?.()
		await expect(firstRequest).resolves.toBe(true)
	})

	it("sends expected invoke payload for note indexing", async () => {
		const invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })

		const result = await store.getState().indexNote("/ws", "/ws/a.md")

		expect(result).toBe(true)
		expect(invoke).toHaveBeenCalledWith("index_note_command", {
			workspacePath: "/ws",
			notePath: "/ws/a.md",
			includeEmbeddings: true,
		})
		expect(store.getState().indexingState["/ws"]).toBe(false)
	})

	it("can disable embeddings for note indexing", async () => {
		const invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })

		const result = await store
			.getState()
			.indexNote("/ws", "/ws/a.md", { includeEmbeddings: false })

		expect(result).toBe(true)
		expect(invoke).toHaveBeenCalledWith("index_note_command", {
			workspacePath: "/ws",
			notePath: "/ws/a.md",
			includeEmbeddings: false,
		})
	})

	it("returns false and clears lock when note indexing fails", async () => {
		const invoke = vi
			.fn()
			.mockRejectedValue(
				new Error("indexing failed"),
			) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const result = await store.getState().indexNote("/ws", "/ws/a.md")

		expect(result).toBe(false)
		expect(store.getState().indexingState["/ws"]).toBe(false)

		errorSpy.mockRestore()
	})
})

describe("indexing-slice indexWorkspace", () => {
	it("sends expected invoke payload for workspace indexing", async () => {
		const invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })

		await store.getState().indexWorkspace("/ws", true)

		expect(invoke).toHaveBeenCalledWith("index_workspace_command", {
			workspacePath: "/ws",
			forceReindex: true,
		})
		expect(store.getState().indexingState["/ws"]).toBe(false)
	})
})
