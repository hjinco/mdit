import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from 'lucide-react'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { TooltipContent, TooltipTrigger } from '@/ui/tooltip'

type ToggleButtonProps = {
  isOpen: boolean
  onToggle: () => void
}

export function ToggleButton({ isOpen, onToggle }: ToggleButtonProps) {
  return (
    <TooltipPrimitive.Root data-slot="tooltip">
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-foreground/70 hover:text-foreground hover:bg-background/60 mr-1"
          onClick={onToggle}
        >
          {isOpen ? <ArrowLeftToLineIcon /> : <ArrowRightToLineIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="pr-1">
        <div className="flex items-center gap-1">
          Toggle
          <KbdGroup>
            <Kbd>Cmd</Kbd>
            <Kbd>\</Kbd>
          </KbdGroup>
        </div>
      </TooltipContent>
    </TooltipPrimitive.Root>
  )
}
