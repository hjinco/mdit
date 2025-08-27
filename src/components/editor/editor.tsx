import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { FileIcon, FilePenIcon } from 'lucide-react'
import {
  Plate,
  PlateContainer,
  PlateContent,
  usePlateEditor,
} from 'platejs/react'
import { useCallback, useEffect, useRef } from 'react'
import { useTabContext } from '@/contexts/tab-context'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { AIKit } from './plugins/ai-kit'
import { AutoformatKit } from './plugins/autoformat-kit'
import { BasicBlocksKit } from './plugins/basic-blocks-kit'
import { BasicMarksKit } from './plugins/basic-marks-kit'
import { BlockSelectionKit } from './plugins/block-selection-kit'
import { CalloutKit } from './plugins/callout-kit'
import { CodeBlockKit } from './plugins/code-block-kit'
import { ColumnKit } from './plugins/column-kit'
import { CursorOverlayKit } from './plugins/cursor-overlay-kit'
import { DateKit } from './plugins/date-kit'
import { DiffKit } from './plugins/diff-kit'
import { DndKit } from './plugins/dnd-kit'
import { EmojiKit } from './plugins/emoji-kit'
import { FloatingToolbarKit } from './plugins/floating-toolbar-kit'
import { LinkKit } from './plugins/link-kit'
import { ListKit } from './plugins/list-kit'
import { MarkdownKit } from './plugins/markdown-kit'
import { MathKit } from './plugins/math-kit'
import { MediaKit } from './plugins/media-kit'
import { SlashKit } from './plugins/slash-kit'
import { TableKit } from './plugins/table-kit'
import { TocKit } from './plugins/toc-kit'
import { UtilsKit } from './plugins/utils-kit'

const plugins = [
  ...AIKit,
  ...AutoformatKit,
  ...BasicBlocksKit,
  ...BasicMarksKit,
  ...BlockSelectionKit,
  ...CalloutKit,
  ...CodeBlockKit,
  ...ColumnKit,
  ...CursorOverlayKit,
  ...EmojiKit,
  ...DateKit,
  ...DiffKit,
  ...DndKit,
  ...FloatingToolbarKit,
  ...LinkKit,
  ...ListKit,
  ...MarkdownKit,
  ...MathKit,
  ...MediaKit,
  ...SlashKit,
  ...TableKit,
  ...TocKit,
  ...UtilsKit,
]

export function Editor() {
  const isSaved = useRef(true)
  const { tab, setTab } = useTabContext()

  const editor = usePlateEditor({
    plugins,
  })

  const openTab = useCallback(async () => {
    const path = await open({
      multiple: false,
      directory: false,
      title: 'Open Note',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (path) {
      const name = path.split('/').pop()?.split('.').shift()
      if (name) {
        setTab({ path, name })
      }
    }
  }, [setTab])

  const createNote = useCallback(async () => {
    const path = await save({
      title: 'Create Note',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (path) {
      const name = path.split('/').pop()?.split('.').shift()
      if (name) {
        await writeTextFile(path, '')
        setTab({ path, name })
      }
    }
  }, [setTab])

  useEffect(() => {
    if (!tab) return
    readTextFile(tab.path)
      .then(editor.api.markdown.deserialize)
      .then((value) => {
        editor.tf.setValue(value)
        editor.tf.focus()
      })
  }, [tab, editor])

  useEffect(() => {
    if (!tab) return

    const appWindow = getCurrentWindow()

    const handleSave = () => {
      if (isSaved.current) return
      writeTextFile(tab.path, editor.api.markdown.serialize())
        .then(() => {
          isSaved.current = true
        })
        .catch(() => {
          isSaved.current = false
        })
    }

    const interval = setInterval(handleSave, 10_000)
    const closeListener = appWindow.listen('tauri://close-requested', () => {
      handleSave()
      appWindow.destroy()
    })

    return () => {
      closeListener.then((unlisten) => unlisten())
      clearInterval(interval)
      handleSave()
    }
  }, [tab, editor])

  if (!tab) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col gap-2">
          <Button variant="ghost" onClick={openTab}>
            <FileIcon /> Open Note
          </Button>
          <Button
            className="w-full justify-start"
            variant="ghost"
            onClick={createNote}
          >
            <FilePenIcon /> New Note
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Plate
      editor={editor}
      onValueChange={() => {
        isSaved.current = false
      }}
    >
      <PlateContainer
        className={cn(
          'ignore-click-outside/toolbar',
          'relative w-full h-full cursor-text overflow-y-auto caret-primary select-text selection:bg-brand/25 focus-visible:outline-none [&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand/25 [&_.slate-selection-area]:bg-brand/15'
        )}
      >
        <PlateContent
          className={cn(
            'group/editor',
            'relative w-full cursor-text overflow-x-hidden break-words whitespace-pre-wrap select-text',
            'rounded-md ring-offset-background focus-visible:outline-none',
            'placeholder:text-muted-foreground/80 **:data-slate-placeholder:!top-1/2 **:data-slate-placeholder:-translate-y-1/2 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100!',
            '[&_strong]:font-bold',
            'size-full px-16 pt-16 pb-72 text-base sm:px-[max(64px,calc(50%-350px))]'
          )}
          autoCapitalize="off"
          spellCheck={false}
          disableDefaultStyles
        />
      </PlateContainer>
    </Plate>
  )
}
