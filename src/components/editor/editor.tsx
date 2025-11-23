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
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { isMac } from '@/utils/platform'
import { HistoryNavigation } from './header/history-navigation'
import { MoreButton } from './header/more-button'
import { Tab } from './header/tab'
import { useAutoRenameOnSave } from './hooks/use-auto-rename-on-save'
import { useLinkedTabName } from './hooks/use-linked-tab-name'
import { EditorKit } from './plugins/editor-kit'
import {
  copySelection,
  cutSelection,
  pasteSelection,
} from './plugins/shortcuts-kit'

export function Editor() {
  const tab = useTabStore((s) => s.tab)
  const isFileExplorerOpen = useUIStore((s) => s.isFileExplorerOpen)
  const isCollectionViewOpen = useWorkspaceStore(
    (s) => s.currentCollectionPath !== null
  )
  const workspacePath = useWorkspaceStore((s) => s.workspacePath)

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
      <div className={cn('flex-1 h-full')}>
        <div className="h-full bg-background">
          <div
            className="h-12 w-full"
            {...(isMac() && { 'data-tauri-drag-region': '' })}
          />
        </div>
      </div>
    )

  return (
    <div className={cn('relative flex-1 flex flex-col bg-background')}>
      <div
        className="w-full h-12 flex items-center justify-center relative"
        {...(isMac() && { 'data-tauri-drag-region': '' })}
      >
        <div
          className={cn(
            'absolute',
            !isFileExplorerOpen && !isCollectionViewOpen
              ? isMac()
                ? 'left-30'
                : 'left-12'
              : 'left-2',
            !workspacePath && (isMac() ? 'left-20' : 'left-2')
          )}
        >
          <HistoryNavigation />
        </div>
        <Tab />
        <div className="absolute right-2">
          <MoreButton />
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorContent key={tab.id} path={tab.path} value={value} />
      </div>
    </div>
  )
}

function EditorContent({ path, value }: { path: string; value: Value }) {
  const isSaved = useRef(true)
  const isInitializing = useRef(true)
  const setTabSaved = useTabStore((s) => s.setTabSaved)

  const editor = usePlateEditor({
    plugins: EditorKit,
    value,
  })

  const { handleRenameAfterSave } = useAutoRenameOnSave(path)

  const handleSave = useCallback(() => {
    if (isSaved.current) return
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
  }, [editor, path, setTabSaved, handleRenameAfterSave])

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

  useLinkedTabName(path, value)

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
            'size-full px-16 pt-16 pb-72 text-base sm:px-[max(64px,calc(50%-350px))] text-foreground/85 font-scale-scope'
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
