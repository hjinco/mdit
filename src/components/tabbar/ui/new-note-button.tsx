import { SquarePenIcon } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

export function NewNoteButton() {
  const createAndOpenNote = useWorkspaceStore((s) => s.createAndOpenNote)

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground hover:bg-transparent"
          onClick={createAndOpenNote}
        >
          <SquarePenIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex items-center gap-1">
          New Note
          <KbdGroup>
            <Kbd>Cmd</Kbd>
            <Kbd>N</Kbd>
          </KbdGroup>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
