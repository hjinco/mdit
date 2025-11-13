import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'
import { loadSettings, saveSettings } from '@/lib/settings-utils'

type IndexingConfig = {
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
  skipped_files: string[]
}

type IndexingStore = {
  indexingState: IndexingState
  configs: Record<string, IndexingConfig>
  getIndexingConfig: (
    workspacePath: string | null
  ) => Promise<IndexingConfig | null>
  setIndexingConfig: (
    workspacePath: string,
    embeddingProvider: string,
    embeddingModel: string,
    autoIndex?: boolean
  ) => Promise<void>
  indexWorkspace: (
    workspacePath: string,
    embeddingProvider: string,
    embeddingModel: string,
    forceReindex: boolean
  ) => Promise<WorkspaceIndexSummary>
}

export const useIndexingStore = create<IndexingStore>((set, get) => ({
  indexingState: {},
  configs: {},

  getIndexingConfig: async (workspacePath: string | null) => {
    if (!workspacePath) {
      return null
    }

    // Check store state first
    const state = get()
    if (state.configs[workspacePath]) {
      return state.configs[workspacePath]
    }

    // Load from settings file and cache in store
    const settings = await loadSettings(workspacePath)
    const indexing = settings.indexing

    if (indexing) {
      const config: IndexingConfig = {
        embeddingProvider: indexing.embeddingProvider ?? '',
        embeddingModel: indexing.embeddingModel ?? '',
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
    autoIndex?: boolean
  ) => {
    const settings = await loadSettings(workspacePath)
    const existingIndexing = settings.indexing

    // Preserve autoIndex if not provided
    const newAutoIndex =
      autoIndex !== undefined
        ? autoIndex
        : (existingIndexing?.autoIndex ?? false)

    const newConfig: IndexingConfig = {
      embeddingProvider,
      embeddingModel,
      autoIndex: newAutoIndex,
    }

    // Update both store state and settings file
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
    forceReindex: boolean
  ) => {
    const isRunning = get().indexingState[workspacePath]
    if (isRunning) {
      throw new Error('Indexing is already running for this workspace')
    }

    set((state) => ({
      indexingState: {
        ...state.indexingState,
        [workspacePath]: true,
      },
    }))

    try {
      return await invoke<WorkspaceIndexSummary>('index_workspace', {
        workspacePath,
        embeddingProvider,
        embeddingModel,
        forceReindex,
      })
    } finally {
      set((state) => ({
        indexingState: {
          ...state.indexingState,
          [workspacePath]: false,
        },
      }))
    }
  },
}))
