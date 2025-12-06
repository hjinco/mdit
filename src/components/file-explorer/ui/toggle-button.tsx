import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from 'lucide-react'
import { useFocusMode } from '@/contexts/focus-mode-context'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getModifierKey } from '@/utils/keyboard-shortcut'

type Props = {
  isOpen: boolean
  onToggle: () => void
}

export function ToggleButton({ isOpen, onToggle }: Props) {
  const { isFocusMode } = useFocusMode()
  const isScrolling = useEditorStore((s) => s.isScrolling)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'text-foreground/70 transition-[opacity] duration-500',
            (isFocusMode || isScrolling) &&
              !isOpen &&
              'pointer-events-none opacity-0'
          )}
          onClick={onToggle}
        >
          {isOpen ? <ArrowLeftToLineIcon /> : <ArrowRightToLineIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="pr-1">
        <div className="flex items-center gap-1">
          Toggle
          <KbdGroup>
            <Kbd>{getModifierKey()}</Kbd>
            <Kbd>S</Kbd>
          </KbdGroup>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
