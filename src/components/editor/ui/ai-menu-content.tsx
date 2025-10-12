import { Command as CommandPrimitive } from 'cmdk'
import { Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Command, CommandList } from '@/ui/command'
import type { Command as TCommand } from '../hooks/use-ai-commands'
import { AIMenuItems } from './ai-menu-items'
import { AIModelSelector } from './ai-model-selector'

type EditorChatState = 'cursorCommand' | 'cursorSuggestion' | 'selectionCommand'

interface AIMenuContentProps {
  chatConfig: {
    provider: string
    model: string
    apiKey: string
  } | null
  connectedProviders: string[]
  providers: Record<string, string[]>
  modelPopoverOpen: boolean
  isLoading: boolean
  messages: any[]
  commands: TCommand[]
  input: string
  value: string
  menuState: EditorChatState
  onModelPopoverOpenChange: (open: boolean) => void
  onProviderDisconnect: (provider: string) => void
  onModelSelect: (provider: string, model: string) => void
  onApiKeySubmit: (provider: string, apiKey: string) => void
  onModelNameSubmit: (provider: string, modelName: string) => void
  onValueChange: (value: string) => void
  onInputChange: (value: string) => void
  onInputClick: () => void
  onInputKeyDown: (e: React.KeyboardEvent) => void
  onAddCommandOpen: () => void
  onCommandRemove: (type: 'selectionCommand', label: string) => void
}

export function AIMenuContent({
  chatConfig,
  connectedProviders,
  modelPopoverOpen,
  isLoading,
  messages,
  commands,
  input,
  value,
  menuState,
  onModelPopoverOpenChange,
  onProviderDisconnect,
  onModelSelect,
  onApiKeySubmit,
  onModelNameSubmit,
  providers,
  onValueChange,
  onInputChange,
  onInputClick,
  onInputKeyDown,
  onAddCommandOpen,
  onCommandRemove,
}: AIMenuContentProps) {
  return (
    <>
      {menuState !== 'cursorSuggestion' && (
        <AIModelSelector
          chatConfig={chatConfig}
          connectedProviders={connectedProviders}
          providers={providers}
          modelPopoverOpen={modelPopoverOpen}
          onModelPopoverOpenChange={onModelPopoverOpenChange}
          onProviderDisconnect={onProviderDisconnect}
          onModelSelect={onModelSelect}
          onApiKeySubmit={onApiKeySubmit}
          onModelNameSubmit={onModelNameSubmit}
        />
      )}
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
              commands={commands}
              input={input}
              setInput={onInputChange}
              setValue={onValueChange}
              disabled={!chatConfig}
              menuState={menuState}
              onAddCommandOpen={onAddCommandOpen}
              onCommandRemove={onCommandRemove}
            />
          </CommandList>
        )}
      </Command>
    </>
  )
}
