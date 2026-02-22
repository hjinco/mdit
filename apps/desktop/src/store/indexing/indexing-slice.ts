import { invoke as tauriInvoke } from "@tauri-apps/api/core"
import type { StateCreator } from "zustand"
import {
	IndexingService,
	type InvokeFunction,
} from "@/services/indexing-service"
import {
	type IndexingMeta,
	isModelChanging,
	parseEmbeddingModelValue,
	shouldShowModelChangeWarning,
} from "./helpers/indexing-utils"

export type IndexingConfig = {
	embeddingProvider: string
	embeddingModel: string
}

type IndexingState = Record<string, boolean>

export type WorkspaceIndexSummary = {
	files_discovered: number
	files_processed: number
	docs_inserted: number
	docs_deleted: number
	segments_created: number
	segments_updated: number
	embeddings_written: number
	links_written: number
	links_deleted: number
	skipped_files: string[]
}

type PendingModelChange = {
	provider: string
	model: string
}

type EmbeddingModelsState = {
	ollamaModels: string[]
}

export type IndexingSlice = {
	// State
	indexingState: IndexingState
	configs: Record<string, IndexingConfig>
	indexedDocCount: number
	isMetaLoading: boolean
	showModelChangeDialog: boolean
	pendingModelChange: PendingModelChange | null

	// Existing actions
	getIndexingConfig: (
		workspacePath: string | null,
	) => Promise<IndexingConfig | null>
	setIndexingConfig: (
		workspacePath: string,
		embeddingProvider: string,
		embeddingModel: string,
	) => Promise<void>
	indexWorkspace: (
		workspacePath: string,
		forceReindex: boolean,
	) => Promise<WorkspaceIndexSummary>
	indexNote: (
		workspacePath: string,
		notePath: string,
		options?: { includeEmbeddings?: boolean },
	) => Promise<boolean>

	loadIndexingMeta: (workspacePath: string) => Promise<void>
	startIndexingMetaPolling: (workspacePath: string) => void
	stopIndexingMetaPolling: (clearWorkspacePath?: boolean) => void
	handleModelChangeRequest: (
		value: string,
		workspacePath: string,
		currentConfig: IndexingConfig | null,
		indexedCount: number,
	) => Promise<void>
	confirmModelChange: (
		workspacePath: string,
		forceReindex: boolean,
	) => Promise<void>
	cancelModelChange: () => void
}

type TimerUtils = {
	setInterval: (handler: TimerHandler, timeout?: number) => number
	clearInterval: (id: number) => void
	Date: typeof Date
}

type IndexingSliceDependencies = {
	invoke: InvokeFunction
	createIndexingService: (
		invoke: InvokeFunction,
		path: string,
	) => IndexingService
	timerUtils?: TimerUtils
}

const defaultTimerUtils: TimerUtils = {
	setInterval: (handler: TimerHandler, timeout?: number) =>
		window.setInterval(handler, timeout),
	clearInterval: (id: number) => window.clearInterval(id),
	Date,
}

export const prepareIndexingSlice = ({
	invoke,
	createIndexingService,
	timerUtils = defaultTimerUtils,
}: IndexingSliceDependencies): StateCreator<
	IndexingSlice & EmbeddingModelsState,
	[],
	[],
	IndexingSlice
> => {
	let pollingIntervalId: number | null = null
	let currentWorkspacePath: string | null = null

	return (set, get) => ({
		indexingState: {},
		configs: {},
		indexedDocCount: 0,
		isMetaLoading: false,
		showModelChangeDialog: false,
		pendingModelChange: null,

		getIndexingConfig: async (workspacePath: string | null) => {
			if (!workspacePath) {
				return null
			}

			const state = get()
			if (state.configs[workspacePath]) {
				return state.configs[workspacePath]
			}

			const service = createIndexingService(invoke, workspacePath)
			const dbConfig = await service.getIndexingConfig()

			if (dbConfig) {
				const config: IndexingConfig = {
					embeddingProvider: dbConfig.embeddingProvider ?? "",
					embeddingModel: dbConfig.embeddingModel ?? "",
				}

				set((state) => ({
					configs: {
						...state.configs,
						[workspacePath]: config,
					},
				}))

				return config
			}

			set((state) => {
				const nextConfigs = { ...state.configs }
				delete nextConfigs[workspacePath]
				return { configs: nextConfigs }
			})

			return null
		},

		setIndexingConfig: async (
			workspacePath: string,
			embeddingProvider: string,
			embeddingModel: string,
		) => {
			const service = createIndexingService(invoke, workspacePath)
			await service.setIndexingConfig(embeddingProvider, embeddingModel)
			const trimmedModel = embeddingModel.trim()

			if (!trimmedModel) {
				set((state) => {
					const nextConfigs = { ...state.configs }
					delete nextConfigs[workspacePath]
					return { configs: nextConfigs }
				})
				return
			}

			const trimmedProvider = embeddingProvider.trim()
			const normalizedProvider = trimmedProvider || "ollama"
			const newConfig: IndexingConfig = {
				embeddingProvider: normalizedProvider,
				embeddingModel: trimmedModel,
			}

			set((state) => ({
				configs: {
					...state.configs,
					[workspacePath]: newConfig,
				},
			}))
		},

		indexWorkspace: async (workspacePath: string, forceReindex: boolean) => {
			const isRunning = get().indexingState[workspacePath]
			if (isRunning) {
				throw new Error("Indexing is already running for this workspace")
			}

			set((state) => ({
				indexingState: {
					...state.indexingState,
					[workspacePath]: true,
				},
			}))

			try {
				const service = createIndexingService(invoke, workspacePath)
				const result = await service.indexWorkspace(forceReindex)
				return result
			} finally {
				set((state) => ({
					indexingState: {
						...state.indexingState,
						[workspacePath]: false,
					},
				}))
			}
		},

		indexNote: async (
			workspacePath: string,
			notePath: string,
			options?: { includeEmbeddings?: boolean },
		) => {
			const isRunning = get().indexingState[workspacePath]
			if (isRunning) {
				return false
			}

			set((state) => ({
				indexingState: {
					...state.indexingState,
					[workspacePath]: true,
				},
			}))

			try {
				const service = createIndexingService(invoke, workspacePath)
				await service.indexNote(notePath, options)
				return true
			} catch (error) {
				console.error("Failed to index note:", error)
				return false
			} finally {
				set((state) => ({
					indexingState: {
						...state.indexingState,
						[workspacePath]: false,
					},
				}))
			}
		},

		loadIndexingMeta: async (workspacePath: string) => {
			currentWorkspacePath = workspacePath
			set({ isMetaLoading: true })

			try {
				const service = createIndexingService(invoke, workspacePath)
				const meta = await service.getIndexingMeta()

				// Only update if we're still viewing the same workspace
				if (currentWorkspacePath === workspacePath) {
					set({ indexedDocCount: meta.indexedDocCount ?? 0 })
				}
			} catch {
				if (currentWorkspacePath === workspacePath) {
					set({ indexedDocCount: 0 })
				}
			} finally {
				if (currentWorkspacePath === workspacePath) {
					set({ isMetaLoading: false })
				}
			}
		},

		startIndexingMetaPolling: (workspacePath: string) => {
			// Clear any existing interval
			if (pollingIntervalId !== null) {
				timerUtils.clearInterval(pollingIntervalId)
				pollingIntervalId = null
			}

			currentWorkspacePath = workspacePath

			// Load immediately and start polling
			const poll = () => {
				const service = createIndexingService(invoke, workspacePath)
				service
					.getIndexingMeta()
					.then((meta: IndexingMeta) => {
						if (currentWorkspacePath === workspacePath) {
							set({ indexedDocCount: meta.indexedDocCount ?? 0 })
						}
					})
					.catch(() => {
						if (currentWorkspacePath === workspacePath) {
							set({ indexedDocCount: 0 })
						}
					})
			}

			poll()
			pollingIntervalId = timerUtils.setInterval(poll, 5000)
		},

		stopIndexingMetaPolling: (clearWorkspacePath = false) => {
			if (pollingIntervalId !== null) {
				timerUtils.clearInterval(pollingIntervalId)
				pollingIntervalId = null
			}
			if (clearWorkspacePath) {
				currentWorkspacePath = null
			}
		},

		handleModelChangeRequest: async (
			value: string,
			workspacePath: string,
			currentConfig: IndexingConfig | null,
			indexedCount: number,
		) => {
			const parsed = parseEmbeddingModelValue(value)
			if (!parsed) {
				return
			}

			const { provider, model } = parsed

			const isChanging = isModelChanging(currentConfig, provider, model)
			const shouldShowWarning = shouldShowModelChangeWarning(
				isChanging,
				indexedCount,
			)

			if (shouldShowWarning) {
				set({
					pendingModelChange: { provider, model },
					showModelChangeDialog: true,
				})
				return
			}

			// No warning needed, update model directly
			await get().setIndexingConfig(workspacePath, provider, model)
		},

		confirmModelChange: async (
			workspacePath: string,
			forceReindex: boolean,
		) => {
			const pending = get().pendingModelChange
			if (!pending) {
				return
			}

			const { provider, model } = pending

			// Update model first
			await get().setIndexingConfig(workspacePath, provider, model)

			// Then run indexing if needed
			if (forceReindex) {
				try {
					await get().indexWorkspace(workspacePath, true)
					await get().loadIndexingMeta(workspacePath)
				} catch {
					// Error handling is done by caller or can be improved
				}
			}

			set({
				pendingModelChange: null,
				showModelChangeDialog: false,
			})
		},

		cancelModelChange: () => {
			set({
				pendingModelChange: null,
				showModelChangeDialog: false,
			})
		},
	})
}

export const createIndexingSlice = prepareIndexingSlice({
	invoke: tauriInvoke as InvokeFunction,
	createIndexingService: (invoke: InvokeFunction, workspacePath: string) =>
		new IndexingService(invoke, workspacePath),
})
