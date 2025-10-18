import {
  Check,
  ChevronDownIcon,
  ChevronRightIcon,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAISettingsStore } from '@/store/ai-settings-store'
import { useUIStore } from '@/store/ui-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

interface AIModelSelectorProps {
  modelPopoverOpen: boolean
  onModelPopoverOpenChange: (open: boolean) => void
}

export function AIModelSelector({
  modelPopoverOpen,
  onModelPopoverOpenChange,
}: AIModelSelectorProps) {
  const openSettingsWithTab = useUIStore((s) => s.openSettingsWithTab)
  const { enabledModels, chatConfig, selectModel } = useAISettingsStore()

  return (
    <div className="flex justify-end items-center gap-1.5 py-1">
      <button
        type="button"
        onClick={() => openSettingsWithTab('ai')}
        title="AI Model Settings"
        className="inline-flex items-center justify-center size-6 rounded-sm border border-border/60 bg-background hover:bg-accent hover:border-border transition-colors"
      >
        <Settings className="size-3.5 text-muted-foreground" />
      </button>
      <DropdownMenu
        open={modelPopoverOpen}
        onOpenChange={onModelPopoverOpenChange}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-sm border border-border/60 bg-background hover:bg-accent hover:border-border transition-colors"
          >
            <span className="text-muted-foreground">
              {chatConfig ? chatConfig.model : 'Select model'}
            </span>
            <ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {enabledModels.length > 0 ? (
            enabledModels.map(({ model, provider }) => {
              const isSelected =
                chatConfig?.provider === provider && chatConfig?.model === model
              return (
                <DropdownMenuItem
                  key={`${provider}-${model}`}
                  onClick={() => selectModel(provider, model)}
                  className={cn(
                    'text-xs',
                    isSelected && 'bg-primary/10 text-primary font-medium'
                  )}
                >
                  <span>{model}</span>
                  {isSelected && <Check className="size-3.5 ml-auto" />}
                </DropdownMenuItem>
              )
            })
          ) : (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No enabled models
            </div>
          )}
          <DropdownMenuItem
            onClick={() => openSettingsWithTab('ai')}
            className="text-xs"
          >
            Add models <ChevronRightIcon className="size-3.5 ml-auto" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
