import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"
import type { WorkspaceSettings } from "@/lib/settings-utils"
import {
	IndexingService,
	type InvokeFunction,
} from "@/services/indexing-service"
import { type IndexingSlice, prepareIndexingSlice } from "./indexing-slice"

type LoadSettingsFn = (workspacePath: string) => Promise<WorkspaceSettings>
type SaveSettingsFn = (
	workspacePath: string,
	settings: WorkspaceSettings,
) => Promise<void>

const createLoadSettingsMock = (resolved: WorkspaceSettings = {}) =>
	vi.fn<LoadSettingsFn>().mockResolvedValue(resolved)

const createSaveSettingsMock = () =>
	vi.fn<SaveSettingsFn>().mockResolvedValue(undefined)

function createIndexingStore({
	invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction,
	loadSettings = createLoadSettingsMock(),
	saveSettings = createSaveSettingsMock(),
}: {
	invoke?: InvokeFunction
	loadSettings?: LoadSettingsFn
	saveSettings?: SaveSettingsFn
} = {}) {
	const createSlice = prepareIndexingSlice({
		invoke,
		loadSettings,
		saveSettings,
		createIndexingService: (invokeFn, workspacePath) =>
			new IndexingService(invokeFn, workspacePath),
		timerUtils: {
			setInterval: vi.fn().mockReturnValue(1),
			clearInterval: vi.fn(),
			Date,
		},
	})

	const store = createStore<IndexingSlice>()((set, get, api) =>
		createSlice(set, get, api),
	)

	return { store, loadSettings, saveSettings, invoke }
}

describe("indexing-slice config", () => {
	it("loads embedding config from settings", async () => {
		const { store } = createIndexingStore({
			loadSettings: createLoadSettingsMock({
				indexing: {
					embeddingProvider: "ollama",
					embeddingModel: "mxbai-embed-large",
				} as WorkspaceSettings["indexing"],
			}),
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
	})

	it("persists embedding config", async () => {
		const { store, saveSettings } = createIndexingStore({
			loadSettings: createLoadSettingsMock({
				pinnedDirectories: ["notes"],
				indexing: {
					embeddingProvider: "ollama",
					embeddingModel: "old-model",
				} as WorkspaceSettings["indexing"],
			}),
		})

		await store
			.getState()
			.setIndexingConfig("/ws", "ollama", "mxbai-embed-large")

		expect(saveSettings).toHaveBeenCalledWith("/ws", {
			pinnedDirectories: ["notes"],
			indexing: {
				embeddingProvider: "ollama",
				embeddingModel: "mxbai-embed-large",
			},
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

		const firstRequest = store
			.getState()
			.indexNote("/ws", "/ws/a.md", "ollama", "mxbai-embed-large")

		const skipped = await store
			.getState()
			.indexNote("/ws", "/ws/b.md", "ollama", "mxbai-embed-large")

		expect(skipped).toBe(false)
		expect(invoke).toHaveBeenCalledTimes(1)

		resolveInvoke?.()
		await expect(firstRequest).resolves.toBe(true)
	})

	it("sends expected invoke payload for note indexing", async () => {
		const invoke = vi.fn().mockResolvedValue({}) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })

		const result = await store
			.getState()
			.indexNote("/ws", "/ws/a.md", "ollama", "mxbai-embed-large")

		expect(result).toBe(true)
		expect(invoke).toHaveBeenCalledWith("index_note_command", {
			workspacePath: "/ws",
			notePath: "/ws/a.md",
			embeddingProvider: "ollama",
			embeddingModel: "mxbai-embed-large",
		})
		expect(store.getState().indexingState["/ws"]).toBe(false)
	})

	it("returns false and clears lock when note indexing fails", async () => {
		const invoke = vi
			.fn()
			.mockRejectedValue(
				new Error("indexing failed"),
			) as unknown as InvokeFunction
		const { store } = createIndexingStore({ invoke })
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

		const result = await store
			.getState()
			.indexNote("/ws", "/ws/a.md", "ollama", "mxbai-embed-large")

		expect(result).toBe(false)
		expect(store.getState().indexingState["/ws"]).toBe(false)

		errorSpy.mockRestore()
	})
})
