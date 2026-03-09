import { invoke as tauriInvoke } from "@tauri-apps/api/core"
import type { StateCreator } from "zustand"
import { createTauriIndexingPort, type IndexingPort } from "./indexing-ports"
import type { IndexingConfig, WorkspaceIndexSummary } from "./indexing-types"

type EmbeddingModelsState = {
	ollamaEmbeddingModels: string[]
}

export type IndexingSlice = {
	// State
	config: IndexingConfig | null
	isIndexing: boolean
	indexedDocCount: number
	isMetaLoading: boolean

	// Existing actions
	resetIndexingState: () => void
	getIndexingConfig: (
		workspacePath: string | null,
	) => Promise<IndexingConfig | null>
	setIndexingConfig: (
		workspacePath: string,
		embeddingProvider: string,
		embeddingModel: string,
	) => Promise<void>
	indexVaultDocuments: (
		workspacePath: string,
		forceReindex: boolean,
	) => Promise<WorkspaceIndexSummary>
	refreshWorkspaceEmbeddings: (
		workspacePath: string,
	) => Promise<WorkspaceIndexSummary>

	loadIndexingMeta: (workspacePath: string) => Promise<void>
}

type IndexingSliceDependencies = {
	createIndexingPort: (path: string) => IndexingPort
}

const buildStoredConfig = (
	embeddingProvider: string | null | undefined,
	embeddingModel: string | null | undefined,
): IndexingConfig | null => {
	const normalizedModel = embeddingModel?.trim() ?? ""
	if (!normalizedModel) {
		return null
	}

	const normalizedProvider = embeddingProvider?.trim() || "ollama"
	return {
		embeddingProvider: normalizedProvider,
		embeddingModel: normalizedModel,
	}
}

const buildInitialIndexingState = () => ({
	config: null,
	isIndexing: false,
	indexedDocCount: 0,
	isMetaLoading: false,
})

export const prepareIndexingSlice = ({
	createIndexingPort,
}: IndexingSliceDependencies): StateCreator<
	IndexingSlice & EmbeddingModelsState,
	[],
	[],
	IndexingSlice
> => {
	let workspaceSessionId = 0

	return (set, get) => {
		const isSessionActive = (sessionId: number) =>
			workspaceSessionId === sessionId

		const runExclusiveIndexingTask = async <T>(
			workspacePath: string,
			task: (indexingPort: IndexingPort) => Promise<T>,
		): Promise<T> => {
			const sessionId = workspaceSessionId
			if (get().isIndexing) {
				throw new Error("Indexing is already running for this workspace")
			}

			if (isSessionActive(sessionId)) {
				set({ isIndexing: true })
			}

			try {
				return await task(createIndexingPort(workspacePath))
			} finally {
				if (isSessionActive(sessionId)) {
					set({ isIndexing: false })
				}
			}
		}

		return {
			...buildInitialIndexingState(),

			resetIndexingState: () => {
				workspaceSessionId += 1
				set(buildInitialIndexingState())
			},

			getIndexingConfig: async (workspacePath: string | null) => {
				if (!workspacePath) {
					return null
				}

				const state = get()
				if (state.config) {
					return state.config
				}

				const sessionId = workspaceSessionId
				const indexingPort = createIndexingPort(workspacePath)
				const dbConfig = await indexingPort.getIndexingConfig()
				const config = buildStoredConfig(
					dbConfig?.embeddingProvider,
					dbConfig?.embeddingModel,
				)

				if (workspaceSessionId === sessionId) {
					set({ config })
				}

				return config
			},

			setIndexingConfig: async (
				workspacePath: string,
				embeddingProvider: string,
				embeddingModel: string,
			) => {
				const sessionId = workspaceSessionId
				const indexingPort = createIndexingPort(workspacePath)
				await indexingPort.setIndexingConfig(embeddingProvider, embeddingModel)
				if (workspaceSessionId !== sessionId) {
					return
				}

				set({
					config: buildStoredConfig(embeddingProvider, embeddingModel),
				})
			},

			indexVaultDocuments: (workspacePath: string, forceReindex: boolean) =>
				runExclusiveIndexingTask(workspacePath, (indexingPort) =>
					indexingPort.indexVaultDocuments(forceReindex),
				),

			refreshWorkspaceEmbeddings: (workspacePath: string) =>
				runExclusiveIndexingTask(workspacePath, (indexingPort) =>
					indexingPort.refreshWorkspaceEmbeddings(),
				),

			loadIndexingMeta: async (workspacePath: string) => {
				const sessionId = workspaceSessionId
				if (workspaceSessionId === sessionId) {
					set({ isMetaLoading: true })
				}

				try {
					const indexingPort = createIndexingPort(workspacePath)
					const meta = await indexingPort.getIndexingMeta()

					if (workspaceSessionId === sessionId) {
						set({ indexedDocCount: meta.indexedDocCount ?? 0 })
					}
				} catch {
					if (workspaceSessionId === sessionId) {
						set({ indexedDocCount: 0 })
					}
				} finally {
					if (workspaceSessionId === sessionId) {
						set({ isMetaLoading: false })
					}
				}
			},
		}
	}
}

export const createIndexingSlice = prepareIndexingSlice({
	createIndexingPort: (workspacePath: string) =>
		createTauriIndexingPort(tauriInvoke, workspacePath),
})
