import { Command as CommandPrimitive } from 'cmdk'
import {
  Check,
  ChevronDownIcon,
  Link,
  Loader2Icon,
  UnlinkIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Command, CommandList } from '@/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Input } from '@/ui/input'
import { AIMenuItems } from './ai-menu-items'

const providers = {
  google: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
}

interface AIMenuContentProps {
  chatConfig: {
    provider: string
    model: string
    apiKey: string
  } | null
  connectedProviders: string[]
  showApiKeyInput: boolean
  apiKeyInput: string
  modelPopoverOpen: boolean
  isLoading: boolean
  messages: any[]
  input: string
  value: string
  onModelPopoverOpenChange: (open: boolean) => void
  onProviderDisconnect: (provider: string) => void
  onShowApiKeyInput: (show: boolean) => void
  onApiKeyInputChange: (value: string) => void
  onModelSelect: (provider: string, model: string) => void
  onApiKeySubmit: (provider: string, apiKey: string) => void
  onValueChange: (value: string) => void
  onInputChange: (value: string) => void
  onInputClick: () => void
  onInputKeyDown: (e: React.KeyboardEvent) => void
  onAccept: () => void
}

export function AIMenuContent({
  chatConfig,
  connectedProviders,
  showApiKeyInput,
  apiKeyInput,
  modelPopoverOpen,
  isLoading,
  messages,
  input,
  value,
  onModelPopoverOpenChange,
  onProviderDisconnect,
  onShowApiKeyInput,
  onApiKeyInputChange,
  onModelSelect,
  onApiKeySubmit,
  onValueChange,
  onInputChange,
  onInputClick,
  onInputKeyDown,
  onAccept,
}: AIMenuContentProps) {
  return (
    <>
      <div className="flex justify-end py-1">
        <DropdownMenu
          open={modelPopoverOpen}
          onOpenChange={onModelPopoverOpenChange}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center text-xs gap-0.5 px-1.5 py-1 border rounded-full bg-background/50 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {chatConfig ? chatConfig.model : 'Select model'}
              <ChevronDownIcon className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {Object.entries(providers).map(([provider, models]) => (
              <DropdownMenuGroup key={provider}>
                <div className="flex items-center justify-between">
                  <DropdownMenuLabel className="text-xs">
                    {provider}
                  </DropdownMenuLabel>
                  {connectedProviders.includes(provider) ? (
                    <button
                      type="button"
                      onClick={() => onProviderDisconnect(provider)}
                      title={`Disconnect ${provider}`}
                      className="pr-2"
                    >
                      <UnlinkIcon className="size-3 hover:text-destructive" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onShowApiKeyInput(true)}
                      title={`Connect ${provider}`}
                      className="pr-2"
                    >
                      <Link className="size-3 hover:text-primary" />
                    </button>
                  )}
                </div>
                {connectedProviders.includes(provider)
                  ? models.map((model) => (
                      <DropdownMenuItem
                        key={model}
                        onClick={() => onModelSelect(provider, model)}
                        className={cn(
                          'text-xs',
                          chatConfig?.provider === provider &&
                            chatConfig?.model === model &&
                            'bg-accent text-accent-foreground'
                        )}
                      >
                        {model}
                        {chatConfig?.provider === provider &&
                          chatConfig?.model === model && (
                            <Check className="ml-auto size-3" />
                          )}
                      </DropdownMenuItem>
                    ))
                  : showApiKeyInput && (
                      <div className="px-2 py-1">
                        <div className="space-y-2">
                          <Input
                            id="api-key"
                            type="password"
                            value={apiKeyInput}
                            onChange={(e) =>
                              onApiKeyInputChange(e.target.value)
                            }
                            placeholder={`Enter ${provider} API key`}
                            className="md:text-xs h-7"
                          />
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() =>
                                onApiKeySubmit(provider, apiKeyInput)
                              }
                              disabled={!apiKeyInput.trim()}
                              className="text-xs h-7"
                            >
                              Connect
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                onShowApiKeyInput(false)
                                onApiKeyInputChange('')
                              }}
                              className="text-xs h-7"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Command
        className="w-full rounded-lg border shadow-md"
        onValueChange={onValueChange}
        value={value}
      >
        {isLoading ? (
          <div className="flex grow select-none items-center gap-2 p-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            {messages.length > 1 ? 'Editing...' : 'Thinking...'}
          </div>
        ) : (
          <CommandPrimitive.Input
            autoFocus
            className={cn(
              'flex h-9 w-full min-w-0 bg-transparent border-input border-b px-3 py-1 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground md:text-sm dark:bg-input/30',
              'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
              'focus-visible:ring-transparent',
              !chatConfig && 'cursor-pointer'
            )}
            data-plate-focus
            onClick={onInputClick}
            onKeyDown={onInputKeyDown}
            onValueChange={onInputChange}
            placeholder={
              chatConfig
                ? 'Ask AI anything...'
                : 'Select a model to get started...'
            }
            value={input}
          />
        )}

        {!isLoading && (
          <CommandList>
            <AIMenuItems
              setValue={onValueChange}
              onAccept={onAccept}
              disabled={!chatConfig}
            />
          </CommandList>
        )}
      </Command>
    </>
  )
}
