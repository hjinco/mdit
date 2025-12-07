import { getCurrentWindow } from '@tauri-apps/api/window'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { createSlateEditor, type Value } from 'platejs'
import {
  Plate,
  PlateContainer,
  PlateContent,
  usePlateEditor,
} from 'platejs/react'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { useFocusMode } from '@/contexts/focus-mode-context'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import { useTabStore } from '@/store/tab-store'
import { isMac } from '@/utils/platform'
import { Header } from './header/header'
import { useAutoRenameOnSave } from './hooks/use-auto-rename-on-save'
import { useCommandMenuSelectionRestore } from './hooks/use-command-menu-selection-restore'
import { useLinkedTabName } from './hooks/use-linked-tab-name'
import { EditorKit } from './plugins/editor-kit'

export function Editor() {
  const tab = useTabStore((s) => s.tab)
  const { handleTypingProgress } = useFocusMode()

  const editor = useMemo(() => {
    return createSlateEditor({
      plugins: EditorKit,
    })
  }, [])

  const value = useMemo(() => {
    if (!tab) return
    return editor.api.markdown.deserialize(tab.content)
  }, [tab, editor])

  if (!tab || !value)
    return (
      <div className="flex-1 h-full">
        <div className="h-full bg-background shadow">
          <div
            className="h-12 w-full"
            {...(isMac() && { 'data-tauri-drag-region': '' })}
          />
        </div>
      </div>
    )

  return (
    <div className="relative max-w-full w-full overflow-x-auto flex flex-col bg-background shadow">
      <Header />
      <EditorContent
        key={tab.id}
        path={tab.path}
        value={value}
        onTypingProgress={handleTypingProgress}
      />
    </div>
  )
}

function EditorContent({
  path,
  value,
  onTypingProgress,
}: {
  path: string
  value: Value
  onTypingProgress: () => void
}) {
  const isSaved = useRef(true)
  const isInitializing = useRef(true)
  const setTabSaved = useTabStore((s) => s.setTabSaved)
  const handleScroll = useEditorStore((s) => s.handleScroll)
  const isFrontmatterInputting = useEditorStore((s) => s.isFrontmatterInputting)

  const editor = usePlateEditor({
    plugins: EditorKit,
    value,
  })

  const { handleRenameAfterSave } = useAutoRenameOnSave(path)

  const handleSave = useCallback(() => {
    if (isSaved.current) return
    if (isFrontmatterInputting) return
    writeTextFile(path, editor.api.markdown.serialize())
      .then(() => {
        isSaved.current = true
        setTabSaved(true)
        handleRenameAfterSave()
      })
      .catch(() => {
        isSaved.current = false
        setTabSaved(false)
      })
  }, [editor, path, setTabSaved, handleRenameAfterSave, isFrontmatterInputting])

  useEffect(() => {
    const appWindow = getCurrentWindow()

    const interval = setInterval(handleSave, 10_000)
    const closeListener = appWindow.listen('tauri://close-requested', () => {
      handleSave()
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

  useCommandMenuSelectionRestore(editor)
  useLinkedTabName(path, value)

  const handleTypingDetection = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (
        event.key.length === 1 ||
        event.key === 'Backspace' ||
        event.key === 'Enter'
      ) {
        onTypingProgress()
      }
    },
    [onTypingProgress]
  )

  return (
    <Plate
      editor={editor}
      onValueChange={() => {
        if (isInitializing.current) {
          isInitializing.current = false
        } else {
          isSaved.current = false
          setTabSaved(false)
        }
      }}
    >
      <PlateContainer
        className={cn(
          'ignore-click-outside/toolbar',
          'relative w-full h-full cursor-text overflow-y-auto caret-primary select-text selection:bg-brand/14 focus-visible:outline-none [&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand/25 [&_.slate-selection-area]:bg-brand/14'
        )}
        onScroll={handleScroll}
        onKeyDown={(e) => {
          handleTypingDetection(e)
          // I wish I could just use shortcuts but it's not working as expected
          if (e.key === 'Tab') {
            e.preventDefault()
            e.stopPropagation()
          }
        }}
      >
        <PlateContent
          className={cn(
            'group/editor',
            'relative cursor-text overflow-x-hidden break-words whitespace-pre-wrap select-text',
            'rounded-md ring-offset-background focus-visible:outline-none',
            'placeholder:text-muted-foreground/80 **:data-slate-placeholder:!top-1/2 **:data-slate-placeholder:-translate-y-1/2 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100!',
            '[&_strong]:font-bold',
            'size-full px-8 pt-28 pb-72 text-base sm:px-[max(64px,calc(50%-350px))] text-foreground/85 font-scale-scope'
          )}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
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
