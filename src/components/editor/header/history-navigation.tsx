import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useShallow } from 'zustand/shallow'
import { useStore } from '@/store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getModifierKey } from '@/utils/keyboard-shortcut'

export function HistoryNavigation() {
  const { canGoBack, canGoForward, goBack, goForward } = useStore(
    useShallow((s) => ({
      canGoBack: s.historyIndex > 0,
      canGoForward: s.historyIndex < s.history.length - 1,
      goBack: s.goBack,
      goForward: s.goForward,
    }))
  )

  return (
    <div className="items-center gap-0.5 hidden sm:flex">
      <HistoryButton
        icon={ChevronLeft}
        ariaLabel="Go back"
        tooltipLabel="Back"
        shortcutKeys={[getModifierKey(), '[']}
        disabled={!canGoBack}
        onClick={goBack}
      />
      <HistoryButton
        icon={ChevronRight}
        ariaLabel="Go forward"
        tooltipLabel="Forward"
        shortcutKeys={[getModifierKey(), ']']}
        disabled={!canGoForward}
        onClick={goForward}
      />
    </div>
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
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={ariaLabel}
          variant="ghost"
          size="icon"
          className="text-foreground/70 disabled:opacity-50"
          disabled={disabled}
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
    </Tooltip>
  )
}
