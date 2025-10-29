import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { SquarePenIcon } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { TooltipContent, TooltipTrigger } from '@/ui/tooltip'

export function NewNoteButton() {
  const createAndOpenNote = useWorkspaceStore((s) => s.createAndOpenNote)

  return (
    <TooltipPrimitive.Root data-slot="tooltip">
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-foreground/70 hover:text-foreground hover:bg-background/60"
          onClick={createAndOpenNote}
        >
          <SquarePenIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="pr-1">
        <div className="flex items-center gap-1">
          New Note
          <KbdGroup>
            <Kbd>Cmd</Kbd>
            <Kbd>N</Kbd>
          </KbdGroup>
        </div>
      </TooltipContent>
    </TooltipPrimitive.Root>
  )
}
