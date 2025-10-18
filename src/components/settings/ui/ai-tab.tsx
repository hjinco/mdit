import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAISettingsStore } from '@/store/ai-settings-store'
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
import { Switch } from '@/ui/switch'

export function AITab() {
  const {
    connectedProviders,
    models,
    ollamaModels,
    enabledModels,
    connectProvider,
    disconnectProvider,
    addOllamaModel,
    removeOllamaModel,
    toggleModelEnabled,
  } = useAISettingsStore()

  const [hoveredModel, setHoveredModel] = useState<string | null>(null)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <FieldSet>
        <FieldLegend>AI Models</FieldLegend>
        <FieldDescription>
          Connect to AI providers to enable their models for chat.
        </FieldDescription>
        <FieldGroup>
          {Object.entries(models).map(([provider, models]) => {
            const url =
              provider === 'google'
                ? 'https://aistudio.google.com'
                : provider === 'openai'
                  ? 'https://platform.openai.com'
                  : ''
            const providerName =
              provider === 'google'
                ? 'Google Generative AI'
                : provider === 'openai'
                  ? 'OpenAI'
                  : 'Ollama'
            const isConnected = connectedProviders.includes(provider)

            return (
              <Field key={provider}>
                <FieldLabel
                  className={cn(
                    !isConnected && 'cursor-pointer hover:text-blue-500'
                  )}
                  onClick={() => !isConnected && openUrl(url)}
                >
                  {providerName}
                  {!isConnected && <ExternalLink className="size-3 inline" />}
                </FieldLabel>
                {isConnected ? (
                  <FieldGroup className="gap-0">
                    {models.map((model) => (
                      <Field
                        key={`${provider}-${model}`}
                        orientation="horizontal"
                        className={cn(
                          'py-2',
                          models.indexOf(model) !== models.length - 1 &&
                            'border-b'
                        )}
                      >
                        <FieldContent>
                          <FieldLabel
                            htmlFor={`${provider}-${model}`}
                            className="text-xs"
                          >
                            {model}
                          </FieldLabel>
                        </FieldContent>
                        <Switch
                          id={`${provider}-${model}`}
                          checked={enabledModels.some(
                            (m) => m.provider === provider && m.model === model
                          )}
                          onCheckedChange={(checked) =>
                            toggleModelEnabled(provider, model, checked)
                          }
                        />
                      </Field>
                    ))}
                    <div className="flex justify-end mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => disconnectProvider(provider)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </FieldGroup>
                ) : (
                  <ConnectProvider
                    provider={provider}
                    onConnect={connectProvider}
                  />
                )}
              </Field>
            )
          })}
          <Field>
            <FieldLabel>Ollama</FieldLabel>
            <FieldGroup className="gap-0">
              {ollamaModels.map((model) => (
                <Field
                  key={model}
                  orientation="horizontal"
                  className={cn(
                    'py-2',
                    ollamaModels.indexOf(model) !== ollamaModels.length - 1 &&
                      'border-b'
                  )}
                  onMouseEnter={() => setHoveredModel(model)}
                  onMouseLeave={() => setHoveredModel(null)}
                >
                  <FieldLabel htmlFor={`ollama-${model}`} className="text-xs">
                    {model}
                  </FieldLabel>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOllamaModel(model)}
                      className={cn(
                        'size-5 text-muted-foreground hover:text-destructive hover:bg-transparent',
                        hoveredModel === model
                          ? 'opacity-100'
                          : 'opacity-0 pointer-events-none'
                      )}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    <Switch
                      id={`ollama-${model}`}
                      checked={enabledModels.some(
                        (m) => m.provider === 'ollama' && m.model === model
                      )}
                      onCheckedChange={(checked) =>
                        toggleModelEnabled('ollama', model, checked)
                      }
                    />
                  </div>
                </Field>
              ))}
              <AddOllamaModel onAddOllamaModel={addOllamaModel} />
            </FieldGroup>
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  )
}

interface ConnectProviderProps {
  provider: string
  onConnect: (provider: string, apiKey: string) => void
}

function ConnectProvider({ provider, onConnect }: ConnectProviderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleConnect = () => {
    const apiKey = inputRef.current?.value.trim()
    if (apiKey) {
      onConnect(provider, apiKey)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        type="text"
        placeholder="API Key"
        autoComplete="off"
        spellCheck="false"
      />
      <Button variant="outline" onClick={handleConnect}>
        Connect
      </Button>
    </div>
  )
}

function AddOllamaModel({
  onAddOllamaModel,
}: {
  onAddOllamaModel: (model: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAddModel = () => {
    const model = inputRef.current?.value.trim()
    if (model) {
      onAddOllamaModel(model)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  return (
    <div className="flex items-center gap-2 mt-2">
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
