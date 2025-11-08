import { InfoIcon } from 'lucide-react'
import { useEditorRef } from 'platejs/react'
import { useEffect, useState } from 'react'
import { countGraphemes } from 'unicode-segmenter/grapheme'
import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'

const WORD_SPLIT_REGEX = /\s+/

export function MoreButton() {
  const editor = useEditorRef()
  const [open, setOpen] = useState(false)
  const [stats, setStats] = useState({ characters: 0, words: 0, minutes: 0 })

  useEffect(() => {
    if (!editor || !open) {
      return
    }

    const string = editor.api.string([])
    const characters = countGraphemes(string)
    const words = string
      .trim()
      .split(WORD_SPLIT_REGEX)
      .filter((word) => word.length > 0).length
    const wordsPerMinute = 300
    const minutes = Math.round(words / wordsPerMinute)

    setStats({ characters, words, minutes })
  }, [editor, open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-foreground/70">
          <InfoIcon />
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
