import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type { StateCreator } from 'zustand'
import {
  loadSettings as loadSettingsFromFile,
  saveSettings as saveSettingsToFile,
} from '@/lib/settings-utils'

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
  links_written: number
  links_deleted: number
  skipped_files: string[]
}

export type IndexingSlice = {
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

type IndexingSliceDependencies = {
  invoke: typeof tauriInvoke
  loadSettings: typeof loadSettingsFromFile
  saveSettings: typeof saveSettingsToFile
}

export const prepareIndexingSlice =
  ({
    invoke,
    loadSettings,
    saveSettings,
  }: IndexingSliceDependencies): StateCreator<
    IndexingSlice,
    [],
    [],
    IndexingSlice
  > =>
  (set, get) => ({
    indexingState: {},
    configs: {},

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
        const result = await invoke<WorkspaceIndexSummary>(
          'index_workspace_command',
          {
            workspacePath,
            embeddingProvider,
            embeddingModel,
            forceReindex,
          }
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
  })

export const createIndexingSlice = prepareIndexingSlice({
  invoke: tauriInvoke,
  loadSettings: loadSettingsFromFile,
  saveSettings: saveSettingsToFile,
})
