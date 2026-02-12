import { invoke as tauriInvoke } from "@tauri-apps/api/core"
import type { StateCreator } from "zustand"
import {
	loadSettings as loadSettingsFromFile,
	saveSettings as saveSettingsToFile,
} from "@/lib/settings-utils"
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
	autoIndex?: boolean
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
		autoIndex?: boolean,
	) => Promise<void>
	indexWorkspace: (
		workspacePath: string,
		embeddingProvider: string,
		embeddingModel: string,
		forceReindex: boolean,
	) => Promise<WorkspaceIndexSummary>
	indexNote: (
		workspacePath: string,
		notePath: string,
		embeddingProvider: string,
		embeddingModel: string,
	) => Promise<boolean>

	loadIndexingMeta: (workspacePath: string) => Promise<void>
	startIndexingMetaPolling: (workspacePath: string) => void
	stopIndexingMetaPolling: () => void
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
	loadSettings: typeof loadSettingsFromFile
	saveSettings: typeof saveSettingsToFile
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
	loadSettings,
	saveSettings,
	createIndexingService,
	timerUtils = defaultTimerUtils,
}: IndexingSliceDependencies): StateCreator<
	IndexingSlice,
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

			const settings = await loadSettings(workspacePath)
			const indexing = settings.indexing

			if (indexing) {
				const config: IndexingConfig = {
					embeddingProvider: indexing.embeddingProvider ?? "",
					embeddingModel: indexing.embeddingModel ?? "",
					autoIndex: indexing.autoIndex ?? false,
				}

				set((state) => ({
					configs: {
						...state.configs,
						[workspacePath]: config,
					},
				}))

				return config
			}

			return null
		},

		setIndexingConfig: async (
			workspacePath: string,
			embeddingProvider: string,
			embeddingModel: string,
			autoIndex?: boolean,
		) => {
			const settings = await loadSettings(workspacePath)
			const existingIndexing = settings.indexing

			const newAutoIndex =
				autoIndex !== undefined
					? autoIndex
					: (existingIndexing?.autoIndex ?? false)

			const newConfig: IndexingConfig = {
				embeddingProvider,
				embeddingModel,
				autoIndex: newAutoIndex,
			}

			await saveSettings(workspacePath, {
				...settings,
				indexing: newConfig,
			})

			set((state) => ({
				configs: {
					...state.configs,
					[workspacePath]: newConfig,
				},
			}))
		},

		indexWorkspace: async (
			workspacePath: string,
			embeddingProvider: string,
			embeddingModel: string,
			forceReindex: boolean,
		) => {
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
				const result = await invoke<WorkspaceIndexSummary>(
					"index_workspace_command",
					{
						workspacePath,
						embeddingProvider,
						embeddingModel,
						forceReindex,
					},
				)
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
			embeddingProvider: string,
			embeddingModel: string,
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
				await invoke<WorkspaceIndexSummary>("index_note_command", {
					workspacePath,
					notePath,
					embeddingProvider,
					embeddingModel,
				})
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

		stopIndexingMetaPolling: () => {
			if (pollingIntervalId !== null) {
				timerUtils.clearInterval(pollingIntervalId)
				pollingIntervalId = null
			}
			currentWorkspacePath = null
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
			await get().setIndexingConfig(workspacePath, provider, model, false)
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
			await get().setIndexingConfig(workspacePath, provider, model, false)

			// Then run indexing if needed
			if (forceReindex) {
				try {
					await get().indexWorkspace(workspacePath, provider, model, true)
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
	loadSettings: loadSettingsFromFile,
	saveSettings: saveSettingsToFile,
	createIndexingService: (invoke: InvokeFunction, workspacePath: string) =>
		new IndexingService(invoke, workspacePath),
})
