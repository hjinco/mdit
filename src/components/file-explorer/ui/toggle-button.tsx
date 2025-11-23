import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from 'lucide-react'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getModifierKey } from '@/utils/keyboard-shortcut'

type Props = {
  isOpen: boolean
  onToggle: () => void
}

export function ToggleButton({ isOpen, onToggle }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground/70"
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
