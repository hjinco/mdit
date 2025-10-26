import { BlockSelectionPlugin } from '@platejs/selection/react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { createSlateEditor, type Value } from 'platejs'
import {
  Plate,
  PlateContainer,
  PlateContent,
  usePlateEditor,
} from 'platejs/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import { EditorKit } from './plugins/editor-kit'
import {
  copySelection,
  cutSelection,
  pasteSelection,
} from './plugins/shortcuts-kit'

export function Editor() {
  const tab = useTabStore((s) => s.tab)
  const editor = useMemo(() => {
    return createSlateEditor({
      plugins: EditorKit,
    })
  }, [])

  const value = useMemo(() => {
    if (!tab) return
    return editor.api.markdown.deserialize(tab.content)
  }, [tab, editor])

  if (!tab) return null
  if (!value) return null

  return (
    <div className="font-scale-scope flex-1 h-full overflow-hidden">
      <EditorContent key={tab.id} path={tab.path} value={value} />
    </div>
  )
}

function EditorContent({ path, value }: { path: string; value: Value }) {
  const isSaved = useRef(true)
  const setTabSaved = useTabStore((s) => s.setTabSaved)

  const editor = usePlateEditor({
    plugins: EditorKit,
    value,
  })

  const handleSave = useCallback(() => {
    if (isSaved.current) return
    writeTextFile(path, editor.api.markdown.serialize())
      .then(() => {
        isSaved.current = true
        setTabSaved(true)
      })
      .catch(() => {
        isSaved.current = false
        setTabSaved(false)
      })
  }, [editor, path, setTabSaved])

  useEffect(() => {
    const appWindow = getCurrentWindow()

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
  }, [handleSave])

  useEffect(() => {
    editor.tf.focus()
  }, [editor])

  return (
    <Plate
      editor={editor}
      onChange={() => {
        isSaved.current = false
        setTabSaved(false)
      }}
    >
      <PlateContainer
        className={cn(
          'ignore-click-outside/toolbar',
          'relative w-full h-full cursor-text overflow-y-auto caret-primary select-text selection:bg-brand/14 focus-visible:outline-none [&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand/25 [&_.slate-selection-area]:bg-brand/14'
        )}
        onKeyDown={(e) => {
          // I wish I could just use shortcuts but it's not working as expected
          if (e.key === 'x' && e.metaKey) {
            e.preventDefault()
            e.stopPropagation()
            cutSelection(editor)
          } else if (e.key === 'c' && e.metaKey) {
            e.preventDefault()
            e.stopPropagation()
            copySelection(editor)
          } else if (e.key === 'v' && e.metaKey) {
            const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
            if (blockSelectionApi.blockSelection.getNodes().length === 0) {
              return
            }
            e.preventDefault()
            e.stopPropagation()
            pasteSelection(editor)
          }
        }}
      >
        <PlateContent
          className={cn(
            'group/editor',
            'relative w-full cursor-text overflow-x-hidden break-words whitespace-pre-wrap select-text',
            'rounded-md ring-offset-background focus-visible:outline-none',
            'placeholder:text-muted-foreground/80 **:data-slate-placeholder:!top-1/2 **:data-slate-placeholder:-translate-y-1/2 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100!',
            '[&_strong]:font-bold',
            'size-full px-16 pt-16 pb-72 text-base sm:px-[max(64px,calc(50%-350px))] text-foreground/80'
          )}
          autoCapitalize="off"
          spellCheck={false}
          disableDefaultStyles
          onBlur={() => {
            handleSave()
          }}
        />
      </PlateContainer>
    </Plate>
  )
}
