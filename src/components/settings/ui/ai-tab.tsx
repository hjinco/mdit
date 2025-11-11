import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { Switch } from '@/ui/switch'

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google Generative AI',
  openai: 'OpenAI',
  ollama: 'Ollama',
  anthropic: 'Anthropic',
}

export function AITab() {
  const {
    connectedProviders,
    apiModels,
    ollamaModels,
    enabledChatModels,
    connectProvider,
    disconnectProvider,
    fetchOllamaModels,
    renameConfig,
    selectRenameModel,
    clearRenameModel,
    toggleModelEnabled,
  } = useAISettingsStore()

  useEffect(() => {
    fetchOllamaModels()
  }, [fetchOllamaModels])

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

  const renameOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = []

    connectedProviders.forEach((provider) => {
      const models = apiModels[provider] ?? []
      models.forEach((model) => {
        options.push({
          value: `${provider}:${model}`,
          label: model,
        })
      })
    })

    ollamaModels.forEach((model) => {
      options.push({
        value: `ollama:${model}`,
        label: model,
      })
    })

    if (renameConfig) {
      const value = `${renameConfig.provider}:${renameConfig.model}`
      const exists = options.some((option) => option.value === value)
      if (!exists) {
        options.push({
          value,
          label: renameConfig.model,
        })
      }
    }

    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [connectedProviders, apiModels, ollamaModels, renameConfig])

  const renameSelectValue = renameConfig
    ? `${renameConfig.provider}:${renameConfig.model}`
    : '__none__'

  const hasConnectedProviders = useMemo(() => {
    return (
      Object.entries(apiModels).some(([provider]) =>
        connectedProviders.includes(provider)
      ) || ollamaModels.length > 0
    )
  }, [connectedProviders, apiModels, ollamaModels])

  return (
    <div className="flex-1 overflow-y-auto px-12 pt-12 pb-24">
      <FieldSet className="border-b pb-8">
        <FieldLegend>AI Models</FieldLegend>
        <FieldDescription>Enable models from AI providers</FieldDescription>
        <div>
          <FieldLabel>Chat</FieldLabel>
          <FieldGroup className="gap-0 mt-2">
            {providersMap.map(({ provider, models }) => {
              const isConnected =
                provider === 'ollama'
                  ? true
                  : connectedProviders.includes(provider)

              if (!isConnected) return null

              return (
                <Field key={provider}>
                  <FieldGroup className="gap-0">
                    {models.length === 0 && provider === 'ollama' ? (
                      <div className="py-2 text-sm text-muted-foreground font-normal">
                        No Ollama models available. Make sure Ollama is
                        installed and running.
                      </div>
                    ) : (
                      models.map((model) => (
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
                          </FieldContent>
                          <Switch
                            id={`${provider}-${model}`}
                            checked={enabledChatModels.some(
                              (m) =>
                                m.provider === provider && m.model === model
                            )}
                            onCheckedChange={(checked) =>
                              toggleModelEnabled(provider, model, checked)
                            }
                          />
                        </Field>
                      ))
                    )}
                  </FieldGroup>
                </Field>
              )
            })}
            {!hasConnectedProviders && (
              <div className="py-2 text-sm text-muted-foreground font-normal">
                No chat models available. Connect a provider to get started.
              </div>
            )}
            <FieldGroup className="gap-0 mt-6">
              <Field orientation="horizontal">
                <FieldLabel>Rename with AI</FieldLabel>
                <Select
                  value={renameSelectValue}
                  onValueChange={(value) => {
                    if (value === '__none__') {
                      clearRenameModel()
                      return
                    }
                    const separatorIndex = value.indexOf(':')
                    if (separatorIndex === -1) {
                      clearRenameModel()
                      return
                    }
                    const provider = value.slice(0, separatorIndex)
                    const model = value.slice(separatorIndex + 1)
                    if (!provider || !model) {
                      clearRenameModel()
                      return
                    }
                    selectRenameModel(provider, model)
                  }}
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="__none__">Disabled</SelectItem>
                    {renameOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </div>
      </FieldSet>

      <FieldSet className="mt-8">
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
                  : provider === 'anthropic'
                    ? 'https://console.anthropic.com'
                    : ''
            return (
              <Field key={provider}>
                <FieldLabel
                  className="cursor-pointer hover:text-blue-500"
                  onClick={() => openUrl(url)}
                >
                  {PROVIDER_LABELS[provider]}
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
          <Field orientation="vertical" className="mt-8">
            <FieldContent>
              <FieldLabel>Ollama</FieldLabel>
              <FieldDescription>
                Models are automatically fetched from your local Ollama instance
              </FieldDescription>
            </FieldContent>
            <FieldGroup className="gap-0 mt-2">
              {ollamaModels.length === 0 ? (
                <div className="py-2 text-sm text-muted-foreground font-normal">
                  No Ollama models available. Make sure Ollama is installed and
                  running.
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
