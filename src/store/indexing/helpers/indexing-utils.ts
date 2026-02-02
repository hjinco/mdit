import type { IndexingConfig } from '../indexing-slice'

export type IndexingMeta = {
  indexedDocCount: number
}

/**
 * Calculate indexing progress percentage
 * Pure function - easily testable without mocks
 */
export function calculateIndexingProgress(
  indexedCount: number,
  totalFiles: number
): number {
  if (!totalFiles || totalFiles <= 0) {
    return 0
  }

  const clampedIndexed = Math.min(indexedCount, totalFiles)
  return Math.round((clampedIndexed / totalFiles) * 100)
}

/**
 * Parse embedding model value from "provider|model" format
 * Returns null if invalid format
 */
export function parseEmbeddingModelValue(
  value: string
): { provider: string; model: string } | null {
  const parts = value.split('|')
  if (parts.length < 2) {
    return null
  }

  const [provider, ...modelParts] = parts
  const model = modelParts.join('|')

  if (!provider || !model) {
    return null
  }

  return { provider, model }
}

/**
 * Check if the embedding model is actually changing
 */
export function isModelChanging(
  currentConfig: IndexingConfig | null,
  newProvider: string,
  newModel: string
): boolean {
  if (!currentConfig) {
    return true
  }

  return (
    currentConfig.embeddingProvider !== newProvider ||
    currentConfig.embeddingModel !== newModel
  )
}

/**
 * Determine if we should show the model change warning dialog
 */
export function shouldShowModelChangeWarning(
  isModelChanging: boolean,
  indexedCount: number
): boolean {
  // Show warning if:
  // 1. Model is actually changing (not initial setup)
  // 2. There are indexed documents
  return isModelChanging && indexedCount > 0
}

/**
 * Build the selected embedding model value string
 * Returns null if not configured or available
 */
export function buildSelectedEmbeddingModel(
  embeddingProvider: string,
  embeddingModel: string,
  ollamaModels: string[]
): string | null {
  const isConfigured = embeddingModel !== '' && embeddingProvider !== ''
  const isAvailable = isConfigured && ollamaModels.includes(embeddingModel)

  if (!isAvailable) {
    return null
  }

  return `${embeddingProvider}|${embeddingModel}`
}

/**
 * Check if indexing should be enabled
 */
export function isIndexingEnabled(
  selectedModel: string | null,
  isIndexing: boolean,
  isMetaLoading: boolean
): boolean {
  if (!selectedModel) {
    return false
  }
  if (isIndexing) {
    return false
  }
  if (isMetaLoading) {
    return false
  }
  return true
}
