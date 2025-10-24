import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink, XIcon } from 'lucide-react'
import { useMemo, useRef } from 'react'
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
    apiModels,
    ollamaModels,
    enabledModels,
    connectProvider,
    disconnectProvider,
    addOllamaModel,
    removeOllamaModel,
    toggleModelEnabled,
  } = useAISettingsStore()

  const providersMap = useMemo(() => {
    return Object.entries(apiModels)
      .map(([provider, models]) => {
        return {
          provider,
          models,
        }
      })
      .concat({ provider: 'ollama', models: ollamaModels })
  }, [apiModels, ollamaModels])

  return (
    <div className="flex-1 overflow-y-auto px-12 pt-12 pb-24">
      <FieldSet>
        <FieldLegend>AI Chat Models</FieldLegend>
        <FieldDescription>
          Enable models from AI providers for chat
        </FieldDescription>
        <FieldGroup className="gap-0">
          {providersMap.map(({ provider, models }) => {
            const isConnected =
              provider === 'ollama'
                ? true
                : connectedProviders.includes(provider)

            if (!isConnected) return null

            return (
              <Field key={provider}>
                <FieldGroup className="gap-0">
                  {models.map((model) => (
                    <Field
                      key={`${provider}-${model}`}
                      orientation="horizontal"
                      className="py-2"
                    >
                      <FieldContent className="group flex-row justify-between">
                        <FieldLabel
                          htmlFor={`${provider}-${model}`}
                          className="text-xs"
                        >
                          {model}
                        </FieldLabel>
                        {provider === 'ollama' && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeOllamaModel(model)}
                              className="size-5 text-muted-foreground hover:text-destructive hover:bg-transparent opacity-0 group-hover:opacity-100"
                            >
                              <XIcon className="size-3.5" />
                            </Button>
                          </div>
                        )}
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
                </FieldGroup>
              </Field>
            )
          })}
        </FieldGroup>
      </FieldSet>

      <FieldSet className="mt-12">
        <FieldLegend>Providers</FieldLegend>
        <FieldDescription>
          Connect to AI providers to enable their models
        </FieldDescription>
        <FieldGroup className="gap-2">
          {Object.entries(apiModels).map(([provider]) => {
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
                  : ''
            return (
              <Field key={provider}>
                <FieldLabel
                  className="cursor-pointer hover:text-blue-500"
                  onClick={() => openUrl(url)}
                >
                  {providerName}
                  <ExternalLink className="size-3 inline" />
                </FieldLabel>
                <ConnectProvider
                  isConnected={connectedProviders.includes(provider)}
                  provider={provider}
                  onConnect={connectProvider}
                  onDisconnect={disconnectProvider}
                />
              </Field>
            )
          })}
          <Field>
            <FieldLabel>Ollama</FieldLabel>
            {/* {ollamaModels.map((model) => (
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
              ))} */}
            <AddOllamaModel onAddOllamaModel={addOllamaModel} />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  )
}

interface ConnectProviderProps {
  provider: string
  isConnected: boolean
  onConnect: (provider: string, apiKey: string) => void
  onDisconnect: (provider: string) => void
}

function ConnectProvider({
  provider,
  isConnected,
  onConnect,
  onDisconnect,
}: ConnectProviderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleConnect = () => {
    if (isConnected) {
      onDisconnect(provider)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
      return
    }
    const apiKey = inputRef.current?.value.trim()
    if (apiKey) {
      onConnect(provider, apiKey)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        defaultValue={isConnected ? '****************' : undefined}
        type="password"
        placeholder="API Key"
        autoComplete="off"
        spellCheck="false"
      />
      <Button variant="outline" onClick={handleConnect}>
        {isConnected ? 'Disconnect' : 'Connect'}
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
    <div className="flex items-center gap-2">
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
