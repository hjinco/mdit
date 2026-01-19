import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect } from 'react'
import { useEditorOnlyMode } from '@/components/quick-note/hooks/use-editor-only-mode'
import { useFontScale } from '@/hooks/use-font-scale'
import { useStore } from '@/store'
import { Editor } from '../editor/editor'
import { LicenseKeyButton } from '../license/license-key-button'
import { SettingsDialog } from '../settings/settings'

export function EditNote() {
  const { hasCheckedOpenedFiles } = useEditorOnlyMode()
  useFontScale()
  const setIsEditMode = useStore((s) => s.setIsEditMode)

  useEffect(() => {
    setIsEditMode(true)
    const appWindow = getCurrentWindow()
    const closeListener = appWindow.listen('tauri://close-requested', () => {
      appWindow.destroy()
    })

    return () => {
      closeListener.then((unlisten) => unlisten())
    }
  }, [setIsEditMode])

  if (!hasCheckedOpenedFiles) {
    return <div className="h-screen bg-muted" />
  }

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
