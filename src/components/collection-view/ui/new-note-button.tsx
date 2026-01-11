import { SquarePenIcon } from 'lucide-react'
import { useWorkspaceFsStore } from '@/store/workspace-fs-store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getModifierKey } from '@/utils/keyboard-shortcut'

export function NewNoteButton() {
  const createAndOpenNote = useWorkspaceFsStore((s) => s.createAndOpenNote)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground/70 hover:bg-background/40"
          onClick={createAndOpenNote}
        >
          <SquarePenIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="pr-1">
        <div className="flex items-center gap-1">
          New Note
          <KbdGroup>
            <Kbd>{getModifierKey()}</Kbd>
            <Kbd>N</Kbd>
          </KbdGroup>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
