import { getCurrentWindow } from '@tauri-apps/api/window'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import {
  Plate,
  PlateContainer,
  PlateContent,
  usePlateEditor,
} from 'platejs/react'
import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import { isMac } from '@/utils/platform'
import { Editor } from '../editor/editor'
import { EditorKit } from '../editor/plugins/editor-kit'
import { LicenseKeyButton } from '../license/license-key-button'
import { SettingsDialog } from '../settings/settings'

export function QuickNote() {
  const tab = useTabStore((s) => s.tab)
  const openTab = useTabStore((s) => s.openTab)
  const editor = usePlateEditor({ plugins: EditorKit })

  useEffect(() => {
    editor.tf.focus()
  }, [editor])

  const handleSave = useCallback(async () => {
    const content = editor.api.markdown.serialize()
    if (!content.trim()) {
      return
    }

    const path = await save({
      title: 'Save Note',
      defaultPath: 'Untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })

    if (!path) {
      return
    }

    try {
      await writeTextFile(path, content)
      await openTab(path, false, false, { initialContent: content })
    } catch (error) {
      console.error('Failed to save file:', error)
      toast.error('Failed to save file')
    }
  }, [editor, openTab])

  useEffect(() => {
    const appWindow = getCurrentWindow()
    const closeListener = appWindow.listen('tauri://close-requested', () => {
      appWindow.destroy()
    })

    return () => {
      closeListener.then((unlisten) => unlisten())
    }
  }, [])

  if (tab) {
    return (
      <>
        <div className="h-screen flex flex-col bg-muted">
          <div className="flex-1 flex">
            <Editor />
          </div>
          <div className="fixed bottom-1 right-1">
            <LicenseKeyButton />
          </div>
        </div>
        <SettingsDialog />
      </>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div
        className="fixed top-0 left-0 h-12 w-full z-50"
        {...(isMac() && { 'data-tauri-drag-region': '' })}
      />
      <Plate editor={editor}>
        <PlateContainer
          className={cn(
            'ignore-click-outside/toolbar',
            'relative w-full h-full overflow-y-auto caret-primary select-text selection:bg-brand/14 focus-visible:outline-none [&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand/25 [&_.slate-selection-area]:bg-brand/14'
          )}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
              e.preventDefault()
              handleSave()
            }
          }}
        >
          <PlateContent
            className={cn(
              'group/editor',
              'relative overflow-x-hidden break-words whitespace-pre-wrap select-text',
              'rounded-md ring-offset-background focus-visible:outline-none',
              'placeholder:text-muted-foreground/80 **:data-slate-placeholder:!top-1/2 **:data-slate-placeholder:-translate-y-1/2 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100!',
              '[&_strong]:font-bold',
              'size-full px-8 pt-28 pb-72 min-h-screen text-base sm:px-[max(64px,calc(50%-350px))] text-foreground/90 font-scale-scope'
            )}
            placeholder="'/' for commands..."
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            disableDefaultStyles
          />
        </PlateContainer>
      </Plate>
    </div>
  )
}
