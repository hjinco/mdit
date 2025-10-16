import { getCurrentWindow } from '@tauri-apps/api/window'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import {
  Plate,
  PlateContainer,
  PlateContent,
  usePlateEditor,
} from 'platejs/react'
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import { EditorKit } from './plugins/editor-kit'
import { copySelection, cutSelection } from './plugins/shortcuts-kit'

export function Editor() {
  const ref = useRef<HTMLDivElement>(null)
  const isSaved = useRef(true)
  const { tab, setTabSaved } = useTabStore(
    useShallow((s) => ({ tab: s.tab, setTabSaved: s.setTabSaved }))
  )

  const editor = usePlateEditor({
    plugins: EditorKit,
  })

  useEffect(() => {
    if (!tab) return
    const value = editor.api.markdown.deserialize(tab.content)
    editor.tf.reset()
    editor.tf.withoutSaving(() => {
      editor.tf.setValue(value)
    })
    editor.tf.focus()
  }, [tab, editor])

  useEffect(() => {
    if (!tab) return

    const appWindow = getCurrentWindow()

    const handleSave = () => {
      if (isSaved.current) return
      writeTextFile(tab.path, editor.api.markdown.serialize())
        .then(() => {
          isSaved.current = true
          setTabSaved(true)
        })
        .catch(() => {
          isSaved.current = false
          setTabSaved(false)
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
  }, [tab, editor, setTabSaved])

  if (!tab) {
    return null
  }

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
          'relative w-full h-full cursor-text overflow-y-auto caret-primary select-text selection:bg-brand/15 focus-visible:outline-none [&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand/25 [&_.slate-selection-area]:bg-brand/15'
        )}
        onKeyDown={(e) => {
          // I wish I could just use shortcuts but it's not working as expected
          if (e.key === 'x' && e.metaKey) {
            e.preventDefault()
            e.stopPropagation()
            cutSelection(editor)
          }
          if (e.key === 'c' && e.metaKey) {
            e.preventDefault()
            e.stopPropagation()
            copySelection(editor)
          }
        }}
      >
        <PlateContent
          ref={ref}
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
        />
      </PlateContainer>
    </Plate>
  )
}
