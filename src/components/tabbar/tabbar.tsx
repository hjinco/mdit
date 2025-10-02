import {
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  EllipsisVerticalIcon,
  SquarePenIcon,
} from 'lucide-react'
import { useEditorRef } from 'platejs/react'
import { useMemo, useState } from 'react'
import { countGraphemes } from 'unicode-segmenter/grapheme'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { Tab } from './ui/tab'

const WORD_SPLIT_REGEX = /\s+/

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
      <div className="flex items-center pr-1.5">{tab && <MoreButton />}</div>
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

function MoreButton() {
  const editor = useEditorRef()
  const [open, setOpen] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: true
  const stats = useMemo(() => {
    if (!editor || !open) {
      return { characters: 0, words: 0, minutes: 0 }
    }

    const string = editor.api.string([])
    const characters = countGraphemes(string)
    const words = string
      .trim()
      .split(WORD_SPLIT_REGEX)
      .filter((word) => word.length > 0).length
    const wordsPerMinute = 300
    const minutes = Math.round(words / wordsPerMinute)

    return { characters, words, minutes }
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground hover:bg-transparent"
        >
          <EllipsisVerticalIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48" align="end">
        <div className="space-y-1 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Characters</span>
            <span>{stats.characters}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Words</span>
            <span>{stats.words}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Reading Time</span>
            <span>{stats.minutes} min</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
