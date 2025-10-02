import { SquarePenIcon } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

export function NewNoteButton() {
  const createAndOpenNote = useWorkspaceStore((s) => s.createAndOpenNote)

  return (
    <Tooltip>
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
        <p>New Note (⌘N)</p>
      </TooltipContent>
    </Tooltip>
  )
}

