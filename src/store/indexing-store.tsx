import { create } from 'zustand'

type IndexingConfig = {
  embeddingModel: string
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
  getIndexingConfig: (workspacePath: string | null) => IndexingConfig | null
  setEmbeddingModel: (workspacePath: string, embeddingModel: string) => void
}

const DEFAULT_CONFIG: IndexingConfig = {
  embeddingModel: '',
}

export const useIndexingStore = create<IndexingStore>((_set, get) => {
  return {
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
  }
})
