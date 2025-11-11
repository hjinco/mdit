import { invoke } from '@tauri-apps/api/core'
import { AlertTriangleIcon, Loader2Icon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAISettingsStore } from '@/store/ai-settings-store'
import { useIndexingStore } from '@/store/indexing-store'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/ui/field'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'

type ManualIndexSummary = {
  files_discovered: number
  files_processed: number
  docs_inserted: number
  docs_deleted: number
  segments_created: number
  segments_updated: number
  embeddings_written: number
  skipped_files: string[]
}

type IndexingMeta = {
  embeddingModel: string | null
  indexedDocCount: number
}

export function IndexingTab() {
  const workspacePath = useWorkspaceStore((state) => state.workspacePath)
  const entries = useWorkspaceStore((state) => state.entries)
  const { getIndexingConfig, setEmbeddingModel } = useIndexingStore()
  const { ollamaModels, fetchOllamaModels } = useAISettingsStore()

  useEffect(() => {
    fetchOllamaModels()
  }, [fetchOllamaModels])

  const [embeddingModel, setEmbeddingModelLocal] = useState<string>('')
  const [isIndexing, setIsIndexing] = useState(false)
  const [storedEmbeddingModel, setStoredEmbeddingModel] = useState<
    string | null
  >(null)
  const [isMetaLoading, setIsMetaLoading] = useState(false)
  const [isResetWarningOpen, setIsResetWarningOpen] = useState(false)
  const [indexingProgress, setIndexingProgress] = useState(0)
  const [indexedDocCount, setIndexedDocCount] = useState(0)
  const workspacePathRef = useRef<string | null>(null)

  const totalFiles = useMemo(() => countMarkdownFiles(entries), [entries])

  const loadIndexingMeta = useCallback(async (path: string) => {
    setIsMetaLoading(true)
    try {
      const meta = await invoke<IndexingMeta>('get_indexing_meta', {
        workspacePath: path,
      })

      if (workspacePathRef.current !== path) {
        return
      }

      setStoredEmbeddingModel(meta.embeddingModel ?? null)
      setIndexedDocCount(meta.indexedDocCount ?? 0)
    } catch (error) {
      if (workspacePathRef.current === path) {
        console.error('Failed to load indexing metadata:', error)
        setStoredEmbeddingModel(null)
        setIndexedDocCount(0)
      }
    } finally {
      if (workspacePathRef.current === path) {
        setIsMetaLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    workspacePathRef.current = workspacePath
  }, [workspacePath])

  // Update local state when workspacePath or config changes
  useEffect(() => {
    if (!workspacePath) {
      return
    }

    const currentConfig = getIndexingConfig(workspacePath)
    setEmbeddingModelLocal(currentConfig?.embeddingModel ?? '')
    loadIndexingMeta(workspacePath)
  }, [workspacePath, getIndexingConfig, loadIndexingMeta])

  useEffect(() => {
    if (!totalFiles) {
      setIndexingProgress(0)
      return
    }

    const clampedIndexed = Math.min(indexedDocCount, totalFiles)
    const progress = Math.round((clampedIndexed / totalFiles) * 100)
    setIndexingProgress(progress)
  }, [totalFiles, indexedDocCount])

  const handleEmbeddingModelChange = (value: string) => {
    setEmbeddingModelLocal(value)
    if (workspacePath) {
      setEmbeddingModel(workspacePath, value)
    }
  }

  const isEmbeddingModelConfigured = embeddingModel !== ''
  const isEmbeddingModelAvailable =
    isEmbeddingModelConfigured && ollamaModels.includes(embeddingModel)
  const selectedEmbeddingModel = isEmbeddingModelAvailable
    ? embeddingModel
    : null
  const isIndexButtonDisabled =
    !selectedEmbeddingModel || isIndexing || isMetaLoading

  const runManualIndex = async (forceReindex: boolean) => {
    if (!workspacePath || !selectedEmbeddingModel) {
      return
    }

    setIsIndexing(true)
    try {
      await invoke<ManualIndexSummary>('manual_index_workspace', {
        workspacePath,
        embeddingModel: selectedEmbeddingModel,
        forceReindex,
      })

      setStoredEmbeddingModel(selectedEmbeddingModel)
      await loadIndexingMeta(workspacePath)
    } catch (error) {
      console.error('Failed to index workspace:', error)
    } finally {
      setIsIndexing(false)
    }
  }

  const requiresReset = Boolean(
    storedEmbeddingModel && storedEmbeddingModel !== embeddingModel
  )

  useEffect(() => {
    if (!requiresReset) {
      setIsResetWarningOpen(false)
    }
  }, [requiresReset])

  const handleIndexClick = () => {
    if (!selectedEmbeddingModel) {
      return
    }

    if (requiresReset) {
      setIsResetWarningOpen(true)
      return
    }

    runManualIndex(false)
  }

  const progressLabel = `${indexedDocCount}/${totalFiles || 0} files indexed`

  if (!workspacePath) {
    return (
      <div className="flex-1 overflow-y-auto p-12">
        <FieldSet>
          <FieldLegend>Indexing</FieldLegend>
          <FieldDescription>
            Please open a workspace to configure indexing settings.
          </FieldDescription>
        </FieldSet>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-12">
      <FieldSet>
        <FieldLegend>Indexing</FieldLegend>
        <FieldDescription>
          Configure embedding model and manage workspace indexing
        </FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Embedding Model</FieldLabel>
              <FieldDescription>
                Select the embedding model to use for indexing
              </FieldDescription>
            </FieldContent>
            <Select
              value={selectedEmbeddingModel ?? undefined}
              onValueChange={handleEmbeddingModelChange}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent align="end">
                {ollamaModels.length > 0 ? (
                  ollamaModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No models available
                  </div>
                )}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldContent>
              <FieldLabel>Indexing Progress</FieldLabel>
              <FieldDescription>
                Current indexing progress for the workspace
              </FieldDescription>
            </FieldContent>
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  {indexingProgress}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {progressLabel}
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${indexingProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Progress is estimated using the visible workspace files; actual
                indexed content may differ slightly.
              </p>
            </div>
            <div className="flex justify-end">
              {requiresReset ? (
                <Popover
                  open={isResetWarningOpen}
                  onOpenChange={setIsResetWarningOpen}
                >
                  <PopoverTrigger asChild>
                    <span>
                      <Button
                        onClick={handleIndexClick}
                        variant="outline"
                        size="sm"
                        disabled={isIndexButtonDisabled}
                      >
                        {isIndexing && (
                          <Loader2Icon className="size-4 animate-spin" />
                        )}
                        {isIndexing ? 'Indexing...' : 'Manually Index'}
                      </Button>
                    </span>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangleIcon className="size-4 text-amber-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Reset required</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          The stored embedding model is{' '}
                          <span className="font-semibold">
                            {storedEmbeddingModel ?? 'unknown'}
                          </span>
                          . Indexing with{' '}
                          <span className="font-semibold">
                            {embeddingModel}
                          </span>{' '}
                          will delete existing embeddings and rebuild them.
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsResetWarningOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setIsResetWarningOpen(false)
                          runManualIndex(true)
                        }}
                        disabled={isIndexing}
                      >
                        {isIndexing && (
                          <Loader2Icon className="size-4 animate-spin" />
                        )}
                        Reset & Index
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  onClick={handleIndexClick}
                  variant="outline"
                  size="sm"
                  disabled={isIndexButtonDisabled}
                >
                  {isIndexing && (
                    <Loader2Icon className="size-4 animate-spin" />
                  )}
                  {isIndexing ? 'Indexing...' : 'Manually Index'}
                </Button>
              )}
            </div>
          </Field>

          <Field orientation="vertical">
            <FieldContent>
              <FieldLabel>Ollama Embedding Models</FieldLabel>
              <FieldDescription>
                Models are automatically fetched from your local Ollama instance
              </FieldDescription>
            </FieldContent>
            <FieldGroup className="gap-0 mt-2">
              {ollamaModels.length === 0 ? (
                <div className="py-2 text-sm text-muted-foreground font-normal">
                  No Ollama embedding models available. Make sure Ollama is
                  installed and running.
                </div>
              ) : (
                ollamaModels.map((model) => (
                  <Field key={model} orientation="horizontal" className="py-2">
                    <FieldContent>
                      <FieldLabel className="text-xs">{model}</FieldLabel>
                    </FieldContent>
                  </Field>
                ))
              )}
            </FieldGroup>
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  )
}

const countMarkdownFiles = (entries: WorkspaceEntry[]): number => {
  return entries.reduce((total, entry) => {
    if (entry.isDirectory) {
      return total + countMarkdownFiles(entry.children ?? [])
    }

    return total + (isMarkdown(entry.name) ? 1 : 0)
  }, 0)
}

const isMarkdown = (name: string) => name.toLowerCase().endsWith('.md')
