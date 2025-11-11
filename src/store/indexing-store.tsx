import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'

type IndexingConfig = {
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
      embeddingModel: parsed.embeddingModel ?? '',
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
  getIndexingConfig: (workspacePath: string | null) => IndexingConfig | null
  setEmbeddingModel: (workspacePath: string, embeddingModel: string) => void
  indexWorkspace: (
    workspacePath: string,
    embeddingProvider: string,
    embeddingModel: string,
    forceReindex: boolean
  ) => Promise<WorkspaceIndexSummary>
}

const DEFAULT_CONFIG: IndexingConfig = {
  embeddingModel: '',
}

export const useIndexingStore = create<IndexingStore>((set, get) => {
  return {
    indexingState: {},
    getIndexingConfig: (workspacePath: string | null) => {
      if (!workspacePath) {
        return null
      }

      const stored = getStoredIndexingConfig(workspacePath)
      return stored ?? null
    },

    setEmbeddingModel: (workspacePath: string, embeddingModel: string) => {
      const currentConfig =
        get().getIndexingConfig(workspacePath) ?? DEFAULT_CONFIG
      const newConfig: IndexingConfig = {
        ...currentConfig,
        embeddingModel,
      }
      persistIndexingConfig(workspacePath, newConfig)
    },

    indexWorkspace: async (
      workspacePath: string,
      embeddingProvider: string,
      embeddingModel: string,
      forceReindex: boolean
    ) => {
      if (!workspacePath) {
        throw new Error('Workspace path is required for indexing')
      }

      if (!embeddingModel) {
        throw new Error('Embedding model is required for indexing')
      }

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
        const summary = await invoke<WorkspaceIndexSummary>('index_workspace', {
          workspacePath,
          embeddingProvider,
          embeddingModel,
          forceReindex,
        })

        return summary
      } finally {
        set((state) => ({
          indexingState: {
            ...state.indexingState,
            [workspacePath]: false,
          },
        }))
      }
    },
  }
})
