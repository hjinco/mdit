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

const OLLAMA_EMBEDDING_MODELS_KEY = 'ollama-embedding-models'

const getStoredOllamaEmbeddingModels = (): string[] => {
  if (typeof window === 'undefined') return []

  try {
    const stored = window.localStorage.getItem(OLLAMA_EMBEDDING_MODELS_KEY)
    if (!stored) return []
    return JSON.parse(stored) as string[]
  } catch (error) {
    console.error('Failed to read Ollama embedding models from storage:', error)
    return []
  }
}

type IndexingStore = {
  ollamaEmbeddingModels: string[]
  getIndexingConfig: (workspacePath: string | null) => IndexingConfig | null
  setEmbeddingModel: (workspacePath: string, embeddingModel: string) => void
  addOllamaEmbeddingModel: (model: string) => void
  removeOllamaEmbeddingModel: (model: string) => void
}

const DEFAULT_CONFIG: IndexingConfig = {
  embeddingModel: '',
}

export const useIndexingStore = create<IndexingStore>((set, get) => {
  const initialOllamaModels = getStoredOllamaEmbeddingModels()

  return {
    ollamaEmbeddingModels: initialOllamaModels,

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

    addOllamaEmbeddingModel: (model: string) => {
      set((prev) => {
        if (prev.ollamaEmbeddingModels.includes(model)) {
          return {}
        }
        const newOllamaModels = [...prev.ollamaEmbeddingModels, model]
        localStorage.setItem(
          OLLAMA_EMBEDDING_MODELS_KEY,
          JSON.stringify(newOllamaModels)
        )
        return { ollamaEmbeddingModels: newOllamaModels }
      })
    },

    removeOllamaEmbeddingModel: (model: string) => {
      set((prev) => {
        const newOllamaModels = prev.ollamaEmbeddingModels.filter(
          (m) => m !== model
        )
        localStorage.setItem(
          OLLAMA_EMBEDDING_MODELS_KEY,
          JSON.stringify(newOllamaModels)
        )
        return { ollamaEmbeddingModels: newOllamaModels }
      })
    },
  }
})
