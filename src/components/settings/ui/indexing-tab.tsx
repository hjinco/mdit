import { invoke } from '@tauri-apps/api/core'
import { Loader2Icon, RefreshCcwIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useStore } from '@/store'
import type { WorkspaceEntry } from '@/store/workspace/workspace-slice'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { Switch } from '@/ui/switch'
import { EmbeddingModelChangeDialog } from './embedding-model-change-dialog'

type IndexingMeta = {
  indexedDocCount: number
}

export function IndexingTab() {
  const {
    workspacePath,
    entries,
    ollamaModels,
    fetchOllamaModels,
    setIndexingConfig,
    indexWorkspace,
    indexingState,
    configs,
  } = useStore(
    useShallow((state) => ({
      workspacePath: state.workspacePath,
      entries: state.entries,
      ollamaModels: state.ollamaModels,
      fetchOllamaModels: state.fetchOllamaModels,
      setIndexingConfig: state.setIndexingConfig,
      indexWorkspace: state.indexWorkspace,
      indexingState: state.indexingState,
      configs: state.configs,
    }))
  )
  const isIndexing = workspacePath
    ? (indexingState[workspacePath] ?? false)
    : false

  const [currentConfig, setCurrentConfig] = useState<{
    embeddingProvider: string
    embeddingModel: string
    autoIndex?: boolean
  }>({
    embeddingProvider: '',
    embeddingModel: '',
    autoIndex: false,
  })

  useEffect(() => {
    if (!workspacePath) {
      setCurrentConfig({
        embeddingProvider: '',
        embeddingModel: '',
        autoIndex: false,
      })
      return
    }

    // Check store cache first
    if (configs[workspacePath]) {
      setCurrentConfig({
        embeddingProvider: configs[workspacePath].embeddingProvider,
        embeddingModel: configs[workspacePath].embeddingModel,
        autoIndex: configs[workspacePath].autoIndex ?? false,
      })
      return
    }

    // Load from settings file
    const { getIndexingConfig } = useStore.getState()
    getIndexingConfig(workspacePath).then((config) => {
      if (config) {
        setCurrentConfig({
          embeddingProvider: config.embeddingProvider,
          embeddingModel: config.embeddingModel,
          autoIndex: config.autoIndex ?? false,
        })
      } else {
        setCurrentConfig({
          embeddingProvider: '',
          embeddingModel: '',
          autoIndex: false,
        })
      }
    })
  }, [workspacePath, configs])

  const embeddingProvider = currentConfig.embeddingProvider
  const embeddingModel = currentConfig.embeddingModel
  const autoIndexingEnabled = currentConfig.autoIndex ?? false
  const [isMetaLoading, setIsMetaLoading] = useState(false)
  const [indexingProgress, setIndexingProgress] = useState(0)
  const [indexedDocCount, setIndexedDocCount] = useState(0)
  const workspacePathRef = useRef<string | null>(null)
  const [showModelChangeDialog, setShowModelChangeDialog] = useState(false)
  const [pendingModelChange, setPendingModelChange] = useState<{
    provider: string
    model: string
  } | null>(null)

  const totalFiles = useMemo(() => countMarkdownFiles(entries), [entries])

  useEffect(() => {
    fetchOllamaModels()
  }, [fetchOllamaModels])

  const loadIndexingMeta = useCallback(async (path: string) => {
    setIsMetaLoading(true)
    try {
      const meta = await invoke<IndexingMeta>('get_indexing_meta_command', {
        workspacePath: path,
      })

      if (workspacePathRef.current !== path) {
        return
      }

      setIndexedDocCount(meta.indexedDocCount ?? 0)
    } catch (error) {
      if (workspacePathRef.current === path) {
        console.error('Failed to load indexing metadata:', error)
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

  useEffect(() => {
    if (!workspacePath || !isIndexing) {
      return
    }

    const poll = () => {
      loadIndexingMeta(workspacePath)
    }

    poll()
    const intervalId = window.setInterval(poll, 5000)
    return () => window.clearInterval(intervalId)
  }, [workspacePath, isIndexing, loadIndexingMeta])

  useEffect(() => {
    if (!workspacePath) {
      setIndexedDocCount(0)
      return
    }

    loadIndexingMeta(workspacePath)
  }, [workspacePath, loadIndexingMeta])

  useEffect(() => {
    if (!totalFiles) {
      setIndexingProgress(0)
      return
    }

    const clampedIndexed = Math.min(indexedDocCount, totalFiles)
    const progress = Math.round((clampedIndexed / totalFiles) * 100)
    setIndexingProgress(progress)
  }, [totalFiles, indexedDocCount])

  const handleEmbeddingModelChange = async (value: string) => {
    if (!workspacePath) {
      return
    }

    // Parse provider|model format
    const parts = value.split('|')
    if (parts.length >= 2) {
      const [provider, ...modelParts] = parts
      const model = modelParts.join('|')

      // Check if model is actually changing
      const isModelChanging =
        embeddingProvider !== provider || embeddingModel !== model

      // Show warning dialog if:
      // 1. Model is actually changing (not initial setup)
      // 2. There are indexed documents
      if (isModelChanging && indexedDocCount > 0) {
        setPendingModelChange({ provider, model })
        setShowModelChangeDialog(true)
        return
      }

      // No warning needed, update model directly
      await setIndexingConfig(
        workspacePath,
        provider,
        model,
        autoIndexingEnabled
      )
    }
  }

  const handleConfirmModelChange = async () => {
    if (!workspacePath || !pendingModelChange) {
      return
    }

    const { provider, model } = pendingModelChange

    // Update model first
    await setIndexingConfig(workspacePath, provider, model, autoIndexingEnabled)

    // Then immediately run force reindex
    try {
      await indexWorkspace(workspacePath, provider, model, true)
      await loadIndexingMeta(workspacePath)
    } catch (error) {
      console.error('Failed to reindex workspace:', error)
    }

    setPendingModelChange(null)
  }

  const handleDialogCancel = () => {
    setPendingModelChange(null)
    setShowModelChangeDialog(false)
  }

  const handleAutoIndexingChange = async (checked: boolean) => {
    if (!workspacePath) {
      return
    }
    // Preserve embedding config when updating auto-indexing
    await setIndexingConfig(
      workspacePath,
      embeddingProvider,
      embeddingModel,
      checked
    )
  }

  const isEmbeddingModelConfigured = embeddingModel !== ''
  const isEmbeddingModelAvailable =
    isEmbeddingModelConfigured &&
    embeddingProvider !== '' &&
    ollamaModels.includes(embeddingModel)
  const selectedEmbeddingModel =
    isEmbeddingModelAvailable && embeddingProvider
      ? `${embeddingProvider}|${embeddingModel}`
      : null
  const isIndexButtonDisabled =
    !selectedEmbeddingModel || isIndexing || isMetaLoading

  const runIndex = async (forceReindex: boolean) => {
    if (
      !workspacePath ||
      !selectedEmbeddingModel ||
      !isEmbeddingModelAvailable
    ) {
      return
    }

    try {
      await indexWorkspace(
        workspacePath,
        embeddingProvider,
        embeddingModel,
        forceReindex
      )
      await loadIndexingMeta(workspacePath)
    } catch (error) {
      console.error('Failed to index workspace:', error)
    }
  }

  const progressLabel = `${indexedDocCount}/${totalFiles || 0} files indexed`

  if (!workspacePath) {
    return null
  }

  return (
    <>
      <EmbeddingModelChangeDialog
        open={showModelChangeDialog}
        onOpenChange={(open) => {
          if (open) {
            setShowModelChangeDialog(true)
          } else {
            handleDialogCancel()
          }
        }}
        onConfirm={handleConfirmModelChange}
      />
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
                    ollamaModels.map((model) => {
                      return (
                        <SelectItem key={model} value={`ollama|${model}`}>
                          {model}
                        </SelectItem>
                      )
                    })
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No models available
                    </div>
                  )}
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel>Automatic Indexing</FieldLabel>
                <FieldDescription>
                  Automatically index workspace every 10 minutes
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={autoIndexingEnabled}
                onCheckedChange={handleAutoIndexingChange}
                disabled={!isEmbeddingModelAvailable}
              />
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
                  Progress is estimated using the visible workspace files;
                  actual indexed content may differ slightly.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
                <Button
                  onClick={() => runIndex(false)}
                  variant="outline"
                  size="sm"
                  disabled={isIndexButtonDisabled}
                >
                  {isIndexing && (
                    <Loader2Icon className="size-4 animate-spin" />
                  )}
                  {isIndexing ? 'Indexing...' : 'Manually Index'}
                </Button>
                <Button
                  onClick={() => runIndex(true)}
                  variant="destructive"
                  size="sm"
                  disabled={isIndexing}
                >
                  <RefreshCcwIcon className="size-4" />
                  Force Rebuild
                </Button>
              </div>
            </Field>

            <Field orientation="vertical">
              <FieldContent>
                <FieldLabel>Ollama Embedding Models</FieldLabel>
                <FieldDescription>
                  Models are automatically fetched from your local Ollama
                  instance
                </FieldDescription>
              </FieldContent>
              <FieldGroup className="gap-0 mt-2">
                {ollamaModels.length === 0 ? (
                  <div className="py-2 text-sm text-muted-foreground">
                    No Ollama embedding models available. Make sure Ollama is
                    installed and running.
                  </div>
                ) : (
                  ollamaModels.map((model) => (
                    <Field
                      key={model}
                      orientation="horizontal"
                      className="py-2"
                    >
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
    </>
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
