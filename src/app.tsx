import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { CollectionView } from './components/collection-view/collection-view'
import { CommandMenu } from './components/command-menu/command-menu'
import { Editor } from './components/editor/editor'
import { FileExplorer } from './components/file-explorer/file-explorer'
import { ImageEditDialog } from './components/image/image-edit-dialog'
import { ImagePreviewDialog } from './components/image/image-preview-dialog'
import { LicenseKeyButton } from './components/license/license-key-button'
import { SettingsDialog } from './components/settings/settings'
import { Welcome } from './components/welcome/welcome'
import { ScreenCaptureProvider } from './contexts/screen-capture-context'
import { useAutoIndexing } from './hooks/use-auto-indexing'
import { useEditorOnlyMode } from './hooks/use-editor-only-mode'
import { useFontScale } from './hooks/use-font-scale'
import { useWindows10 } from './hooks/use-windows-10'
import { useWorkspaceStore } from './store/workspace-store'
import { useWorkspaceWatchStore } from './store/workspace-watch-store'
import { isLinux } from './utils/platform'

export function App() {
  const { workspacePath, isLoading } = useWorkspaceStore(
    useShallow((s) => ({
      workspacePath: s.workspacePath,
      isLoading: s.isLoading,
    }))
  )
  const { watchWorkspace, unwatchWorkspace } = useWorkspaceWatchStore(
    useShallow((s) => ({
      watchWorkspace: s.watchWorkspace,
      unwatchWorkspace: s.unwatchWorkspace,
    }))
  )
  const { isEditorOnlyMode, hasCheckedOpenedFiles } = useEditorOnlyMode()
  const isWin10 = useWindows10()
  useFontScale()
  useAutoIndexing(workspacePath)

  const mutedBgClass = isWin10 || isLinux() ? 'bg-muted' : 'bg-muted/70'

  useEffect(() => {
    const appWindow = getCurrentWindow()
    appWindow.show()
    const closeListener = appWindow.listen('tauri://close-requested', () => {
      appWindow.hide()
    })

    return () => {
      closeListener.then((unlisten) => unlisten())
    }
  }, [])

  useEffect(() => {
    if (!workspacePath) {
      unwatchWorkspace()
      return
    }

    watchWorkspace()

    return () => {
      unwatchWorkspace()
    }
  }, [watchWorkspace, unwatchWorkspace, workspacePath])

  if (!hasCheckedOpenedFiles) {
    return <div className={`h-screen ${mutedBgClass}`} />
  }

  if (!isEditorOnlyMode && isLoading) {
    return <div className={`h-screen ${mutedBgClass}`} />
  }

  if (isEditorOnlyMode) {
    return (
      <>
        <div className={`h-screen flex flex-col ${mutedBgClass}`}>
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

  if (!workspacePath) {
    return (
      <div className={mutedBgClass}>
        <Welcome />
      </div>
    )
  }

  return (
    <ScreenCaptureProvider>
      <div className={`h-screen flex flex-col ${mutedBgClass}`}>
        <div className="flex-1 overflow-hidden flex">
          <div className="group/side flex">
            <FileExplorer />
            <CollectionView />
          </div>
          <Editor />
          <div className="fixed bottom-1 right-1">
            <LicenseKeyButton />
          </div>
        </div>
      </div>
      <SettingsDialog />
      <CommandMenu />
      <ImagePreviewDialog />
      <ImageEditDialog />
    </ScreenCaptureProvider>
  )
}
