import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getModifierKey } from '@/utils/keyboard-shortcut'

type Props = {
  isOpen: boolean
  onToggle: () => void
}

export function ToggleButton({ isOpen, onToggle }: Props) {
  const isFocusMode = useEditorStore((s) => s.isFocusMode)
  const isCollectionViewOpen = useWorkspaceStore(
    (s) => s.currentCollectionPath !== null
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'text-foreground/70 transition-[opacity] duration-500',
            isFocusMode && !isOpen && 'pointer-events-none opacity-0',
            (isOpen || isCollectionViewOpen) && 'hover:bg-background/40'
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
