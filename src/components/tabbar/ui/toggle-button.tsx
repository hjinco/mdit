import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from 'lucide-react'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

type ToggleButtonProps = {
  isOpen: boolean
  onToggle: () => void
}

export function ToggleButton({ isOpen, onToggle }: ToggleButtonProps) {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground hover:bg-transparent mr-1"
          onClick={onToggle}
        >
          {isOpen ? <ArrowLeftToLineIcon /> : <ArrowRightToLineIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex items-center gap-1">
          Toggle
          <KbdGroup>
            <Kbd>Cmd</Kbd>
            <Kbd>\</Kbd>
          </KbdGroup>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
