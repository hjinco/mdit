import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'

type IndexingConfig = {
  embeddingProvider: string
  embeddingModel: string
  autoIndexingEnabled?: boolean
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

const getStorageKey = (workspacePath: string) => {
  return `w:${workspacePath}:indexing-config`
}

const getStoredIndexingConfig = (
  workspacePath: string
): IndexingConfig | null => {
  if (typeof window === 'undefined') return null

  try {
    const stored = window.localStorage.getItem(getStorageKey(workspacePath))
    if (!stored) return null

    const parsed = JSON.parse(stored) as Partial<IndexingConfig>
    return {
      embeddingProvider: parsed.embeddingProvider ?? '',
      embeddingModel: parsed.embeddingModel ?? '',
      autoIndexingEnabled: parsed.autoIndexingEnabled ?? false,
    }
  } catch (error) {
    console.error('Failed to read indexing config from storage:', error)
    return null
  }
}

const persistIndexingConfig = (
  workspacePath: string,
  config: IndexingConfig
) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      getStorageKey(workspacePath),
      JSON.stringify(config)
    )
  } catch (error) {
    console.error('Failed to persist indexing config:', error)
  }
}

type IndexingStore = {
  indexingState: IndexingState
  configs: Record<string, IndexingConfig>
  getIndexingConfig: (workspacePath: string | null) => IndexingConfig | null
  setIndexingConfig: (
    workspacePath: string,
    embeddingProvider: string,
    embeddingModel: string,
    autoIndexingEnabled?: boolean
  ) => void
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

  getIndexingConfig: (workspacePath: string | null) => {
    if (!workspacePath) {
      return null
    }

    // Check store state first
    const state = get()
    if (state.configs[workspacePath]) {
      return state.configs[workspacePath]
    }

    // Fallback to localStorage and cache in store
    const stored = getStoredIndexingConfig(workspacePath)
    if (stored) {
      set((state) => ({
        configs: {
          ...state.configs,
          [workspacePath]: stored,
        },
      }))
      return stored
    }

    return null
  },

  setIndexingConfig: (
    workspacePath: string,
    embeddingProvider: string,
    embeddingModel: string,
    autoIndexingEnabled?: boolean
  ) => {
    // Get existing config to preserve autoIndexingEnabled if not provided
    const existingConfig =
      get().configs[workspacePath] ?? getStoredIndexingConfig(workspacePath)

    const newConfig: IndexingConfig = {
      embeddingProvider,
      embeddingModel,
      autoIndexingEnabled:
        autoIndexingEnabled ?? existingConfig?.autoIndexingEnabled ?? false,
    }

    // Update both store state and localStorage
    persistIndexingConfig(workspacePath, newConfig)
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
