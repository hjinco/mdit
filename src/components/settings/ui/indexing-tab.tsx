import { XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useIndexingStore } from '@/store/indexing-store'
import { useWorkspaceStore } from '@/store/workspace-store'
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
import { Input } from '@/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'

const MOCK_INDEXING_PROGRESS = 0

export function IndexingTab() {
  const workspacePath = useWorkspaceStore((state) => state.workspacePath)
  const {
    ollamaEmbeddingModels,
    getIndexingConfig,
    setEmbeddingModel,
    addOllamaEmbeddingModel,
    removeOllamaEmbeddingModel,
  } = useIndexingStore()

  const [embeddingModel, setEmbeddingModelLocal] = useState<string>('')

  // Update local state when workspacePath or config changes
  useEffect(() => {
    if (workspacePath) {
      const currentConfig = getIndexingConfig(workspacePath)
      setEmbeddingModelLocal(currentConfig?.embeddingModel ?? '')
    } else {
      setEmbeddingModelLocal('')
    }
  }, [workspacePath, getIndexingConfig])

  const handleEmbeddingModelChange = (value: string) => {
    setEmbeddingModelLocal(value)
    if (workspacePath) {
      setEmbeddingModel(workspacePath, value)
    }
  }

  const handleIndex = () => {
    // Placeholder - no actual functionality
    console.log('Indexing triggered')
  }

  const isEmbeddingModelConfigured = embeddingModel !== ''

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
              value={embeddingModel || undefined}
              onValueChange={handleEmbeddingModelChange}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent align="end">
                {ollamaEmbeddingModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
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
                  {MOCK_INDEXING_PROGRESS}%
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${MOCK_INDEXING_PROGRESS}%` }}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleIndex}
                variant="outline"
                size="sm"
                disabled={!isEmbeddingModelConfigured}
              >
                Manually Index
              </Button>
            </div>
          </Field>

          <Field orientation="vertical">
            <FieldContent>
              <FieldLabel>Ollama Embedding Models</FieldLabel>
              <FieldDescription>
                Add and manage Ollama embedding models
              </FieldDescription>
            </FieldContent>
            <FieldGroup className="gap-0 mt-2">
              {ollamaEmbeddingModels.map((model) => (
                <Field key={model} orientation="horizontal" className="py-2">
                  <FieldContent className="group flex-row justify-between">
                    <FieldLabel className="text-xs">{model}</FieldLabel>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOllamaEmbeddingModel(model)}
                        className="size-5 text-muted-foreground hover:text-destructive hover:bg-transparent opacity-0 group-hover:opacity-100"
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                  </FieldContent>
                </Field>
              ))}
              {ollamaEmbeddingModels.length === 0 && (
                <div className="py-2 text-sm text-muted-foreground font-normal">
                  No Ollama embedding models added yet.
                </div>
              )}
            </FieldGroup>
            <AddOllamaEmbeddingModel
              onAddOllamaEmbeddingModel={addOllamaEmbeddingModel}
            />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  )
}

function AddOllamaEmbeddingModel({
  onAddOllamaEmbeddingModel,
}: {
  onAddOllamaEmbeddingModel: (model: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAddModel = () => {
    const model = inputRef.current?.value.trim()
    if (model) {
      onAddOllamaEmbeddingModel(model)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  return (
    <div className="flex items-center gap-2 mt-4">
      <Input
        ref={inputRef}
        type="text"
        placeholder="Model Name"
        autoComplete="off"
        spellCheck="false"
      />
      <Button variant="outline" onClick={handleAddModel}>
        Add
      </Button>
    </div>
  )
}
