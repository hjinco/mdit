import { SquarePenIcon } from 'lucide-react'
import { useStore } from '@/store'
import { Button } from '@/ui/button'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getModifierKey } from '@/utils/keyboard-shortcut'

export function NewNoteButton({
  directoryPath,
}: {
  directoryPath: string | null
}) {
  const createNote = useStore((s) => s.createNote)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground/70 hover:bg-background/40"
          onClick={() =>
            directoryPath && createNote(directoryPath, { openTab: true })
          }
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
