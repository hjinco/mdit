import { Check, ChevronDownIcon, Link, UnlinkIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Separator } from '@/ui/separator'

interface AIModelSelectorProps {
  chatConfig: {
    provider: string
    model: string
    apiKey: string
  } | null
  connectedProviders: string[]
  providers: Record<string, string[]>
  modelPopoverOpen: boolean
  onModelPopoverOpenChange: (open: boolean) => void
  onProviderDisconnect: (provider: string) => void
  onModelSelect: (provider: string, model: string) => void
  onApiKeySubmit: (provider: string, apiKey: string) => void
  onModelNameSubmit: (provider: string, modelName: string) => void
}

export function AIModelSelector({
  chatConfig,
  connectedProviders,
  providers,
  modelPopoverOpen,
  onModelPopoverOpenChange,
  onProviderDisconnect,
  onModelSelect,
  onApiKeySubmit,
  onModelNameSubmit,
}: AIModelSelectorProps) {
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showModelNameInput, setShowModelNameInput] = useState(false)
  const [modelNameInput, setModelNameInput] = useState('')
  const [activeProvider, setActiveProvider] = useState<string | null>(null)

  const handleConnect = (provider: string) => {
    setActiveProvider(provider)
    if (provider === 'ollama') {
      setModelNameInput('')
      setShowModelNameInput(true)
      setShowApiKeyInput(false)
    } else {
      setApiKeyInput('')
      setShowApiKeyInput(true)
      setShowModelNameInput(false)
    }
  }

  const handleApiKeySubmitInternal = () => {
    if (activeProvider && apiKeyInput.trim()) {
      onApiKeySubmit(activeProvider, apiKeyInput)
      setShowApiKeyInput(false)
      setApiKeyInput('')
      setActiveProvider(null)
    }
  }

  const handleModelNameSubmitInternal = () => {
    if (activeProvider && modelNameInput.trim()) {
      onModelNameSubmit(activeProvider, modelNameInput)
      setShowModelNameInput(false)
      setModelNameInput('')
      setActiveProvider(null)
    }
  }

  const handleCancel = () => {
    setShowApiKeyInput(false)
    setShowModelNameInput(false)
    setApiKeyInput('')
    setModelNameInput('')
    setActiveProvider(null)
  }

  return (
    <div className="flex justify-end py-1">
      <Popover open={modelPopoverOpen} onOpenChange={onModelPopoverOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border/60 bg-background hover:bg-accent hover:border-border transition-colors"
          >
            <span className="text-muted-foreground">
              {chatConfig ? chatConfig.model : 'Select model'}
            </span>
            <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1">
          <div className="space-y-0.5">
            {Object.entries(providers).map(([provider, models], index) => {
              const isConnected = connectedProviders.includes(provider)
              const shouldShowApiInput =
                showApiKeyInput && activeProvider === provider
              const shouldShowModelInput =
                showModelNameInput && activeProvider === provider

              return (
                <div key={provider}>
                  {index > 0 && <Separator className="my-1" />}
                  <div className="px-2 py-1.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground/90 capitalize">
                        {provider}
                      </span>
                      {isConnected ? (
                        <button
                          type="button"
                          onClick={() => onProviderDisconnect(provider)}
                          title={`Disconnect ${provider}`}
                          className="p-0.5 rounded hover:bg-destructive/10 transition-colors"
                        >
                          <UnlinkIcon className="size-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConnect(provider)}
                          title={`Connect ${provider}`}
                          className="p-0.5 rounded hover:bg-primary/10 transition-colors"
                        >
                          <Link className="size-3.5 text-muted-foreground hover:text-primary transition-colors" />
                        </button>
                      )}
                    </div>
                    {isConnected ? (
                      <div className="space-y-0.5">
                        {provider === 'ollama' ? (
                          <>
                            {models.length > 0 ? (
                              models.map((model) => {
                                const isSelected =
                                  chatConfig?.provider === provider &&
                                  chatConfig?.model === model
                                return (
                                  <button
                                    key={model}
                                    type="button"
                                    onClick={() =>
                                      onModelSelect(provider, model)
                                    }
                                    className={cn(
                                      'w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-md transition-colors text-left',
                                      isSelected
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'hover:bg-accent text-foreground/80 hover:text-foreground'
                                    )}
                                  >
                                    <span>{model}</span>
                                    {isSelected && (
                                      <Check className="size-3.5" />
                                    )}
                                  </button>
                                )
                              })
                            ) : (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                No models configured
                              </div>
                            )}
                            <button
                              key={`${provider}-add-model`}
                              type="button"
                              onClick={() => handleConnect(provider)}
                              className="w-full px-2 py-1.5 text-xs text-primary hover:bg-primary/10 rounded-md transition-colors text-left font-medium"
                            >
                              Add new model...
                            </button>
                          </>
                        ) : (
                          models.map((model) => {
                            const isSelected =
                              chatConfig?.provider === provider &&
                              chatConfig?.model === model
                            return (
                              <button
                                key={model}
                                type="button"
                                onClick={() => onModelSelect(provider, model)}
                                className={cn(
                                  'w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-md transition-colors text-left',
                                  isSelected
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'hover:bg-accent text-foreground/80 hover:text-foreground'
                                )}
                              >
                                <span>{model}</span>
                                {isSelected && <Check className="size-3.5" />}
                              </button>
                            )
                          })
                        )}
                      </div>
                    ) : null}
                    {shouldShowApiInput ? (
                      <div className="mt-2 space-y-2">
                        <Input
                          id="api-key"
                          type="password"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          placeholder={`Enter ${provider} API key`}
                          className="h-8 text-xs"
                          spellCheck={false}
                          autoComplete="off"
                          autoFocus
                          data-plate-focus
                        />
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            onClick={handleApiKeySubmitInternal}
                            disabled={!apiKeyInput.trim()}
                            className="flex-1 h-7 text-xs"
                          >
                            Connect
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancel}
                            className="flex-1 h-7 text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {shouldShowModelInput ? (
                      <div className="mt-2 space-y-2">
                        <Input
                          id="model-name"
                          type="text"
                          value={modelNameInput}
                          onChange={(e) => setModelNameInput(e.target.value)}
                          placeholder="Enter model name (e.g., llama3.2)"
                          className="h-8 text-xs"
                          spellCheck={false}
                          autoComplete="off"
                          autoFocus
                          data-plate-focus
                        />
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            onClick={handleModelNameSubmitInternal}
                            disabled={!modelNameInput.trim()}
                            className="flex-1 h-7 text-xs"
                          >
                            Connect
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancel}
                            className="flex-1 h-7 text-xs"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
