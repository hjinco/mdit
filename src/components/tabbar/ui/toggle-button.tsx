import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from 'lucide-react'
import { Button } from '@/ui/button'

type ToggleButtonProps = {
  isOpen: boolean
  onToggle: () => void
}

export function ToggleButton({ isOpen, onToggle }: ToggleButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:text-foreground hover:bg-transparent mr-1"
      onClick={onToggle}
    >
      {isOpen ? <ArrowLeftToLineIcon /> : <ArrowRightToLineIcon />}
    </Button>
  )
}

