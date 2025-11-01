import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useShallow } from 'zustand/shallow'
import { useTabStore } from '@/store/tab-store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip'
import { useTabNavigationShortcuts } from '../hooks/use-tab-navigation-shortcuts'

export function HistoryNavigation() {
  const { canGoBack, canGoForward, goBack, goForward } = useTabStore(
    useShallow((s) => ({
      canGoBack: s.historyIndex > 0,
      canGoForward: s.historyIndex < s.history.length - 1,
      goBack: s.goBack,
      goForward: s.goForward,
    }))
  )

  useTabNavigationShortcuts(canGoBack, canGoForward, goBack, goForward)

  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={100}>
      <HistoryButton
        icon={ChevronLeft}
        ariaLabel="Go back"
        tooltipLabel="Back"
        shortcutKeys={['Cmd', '[']}
        disabled={!canGoBack}
        onClick={goBack}
      />
      <HistoryButton
        icon={ChevronRight}
        ariaLabel="Go forward"
        tooltipLabel="Forward"
        shortcutKeys={['Cmd', ']']}
        disabled={!canGoForward}
        onClick={goForward}
      />
    </TooltipProvider>
  )
}

interface HistoryButtonProps {
  icon: LucideIcon
  ariaLabel: string
  tooltipLabel: string
  shortcutKeys: [string, string]
  disabled: boolean
  onClick: () => void
}

function HistoryButton({
  icon: Icon,
  ariaLabel,
  tooltipLabel,
  shortcutKeys,
  disabled,
  onClick,
}: HistoryButtonProps) {
  return (
    <TooltipPrimitive.Root data-slot="tooltip">
      <TooltipTrigger asChild>
        <Button
          aria-label={ariaLabel}
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground hover:bg-transparent disabled:opacity-40 disabled:hover:text-muted-foreground"
          disabled={disabled}
          data-tauri-drag-region="no-drag"
          onClick={onClick}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="pr-1">
        <div className="flex items-center gap-1">
          {tooltipLabel}
          <KbdGroup>
            <Kbd>{shortcutKeys[0]}</Kbd>
            <Kbd>{shortcutKeys[1]}</Kbd>
          </KbdGroup>
        </div>
      </TooltipContent>
    </TooltipPrimitive.Root>
  )
}
