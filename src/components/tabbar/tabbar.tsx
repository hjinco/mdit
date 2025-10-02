import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  SquarePenIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { Tab } from './ui/tab'

export function Tabbar() {
  const isFileExplorerOpen = useUIStore((state) => state.isFileExplorerOpen)
  const toggleFileExplorer = useUIStore((state) => state.toggleFileExplorer)
  const workspacePath = useWorkspaceStore((s) => s.workspacePath)
  const tab = useTabStore((s) => s.tab)

  if (!workspacePath) {
    return <div className="h-10" data-tauri-drag-region />
  }

  return (
    <div className="flex h-10" data-tauri-drag-region>
      <div
        className={cn(
          'w-64 bg-muted flex items-center justify-end',
          !isFileExplorerOpen && 'bg-background w-36'
        )}
        data-tauri-drag-region
      >
        <NewNoteButton />
        <ToggleButton
          isOpen={isFileExplorerOpen}
          onToggle={toggleFileExplorer}
        />
      </div>
      <div className="flex-1 flex justify-center" data-tauri-drag-region>
        {tab && <Tab name={tab?.name || 'Untitled'} />}
      </div>
    </div>
  )
}

function NewNoteButton() {
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

function ToggleButton({
  isOpen,
  onToggle,
}: {
  isOpen: boolean
  onToggle: () => void
}) {
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
