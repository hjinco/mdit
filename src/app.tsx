import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { CollectionView } from './components/collection-view/collection-view'
import { CommandMenu } from './components/command-menu/command-menu'
import { Editor } from './components/editor/editor'
import { FileExplorer } from './components/file-explorer/file-explorer'
import { ImagePreviewDialog } from './components/image-preview/image-preview-dialog'
import { SettingsDialog } from './components/settings/settings'
import { Welcome } from './components/welcome/welcome'
import { DndProvider } from './contexts/dnd-provider'
import { useAutoIndexing } from './hooks/use-auto-indexing'
import { useEditorOnlyMode } from './hooks/use-editor-only-mode'
import { useFontScale } from './hooks/use-font-scale'
import { cn } from './lib/utils'
import { useLicenseStore } from './store/license-store'
import { useUIStore } from './store/ui-store'
import { useWorkspaceStore } from './store/workspace-store'
import { Button } from './ui/button'
import { isMac } from './utils/platform'

export function App() {
  const { workspacePath, isLoading } = useWorkspaceStore()
  const { isEditorOnlyMode, hasCheckedOpenedFiles } = useEditorOnlyMode()
  useFontScale()
  useAutoIndexing(workspacePath)

  if (!hasCheckedOpenedFiles) {
    return <div className="h-screen bg-muted/80" />
  }

  if (!isEditorOnlyMode && isLoading) {
    return <div className="h-screen bg-muted/80" />
  }

  if (isEditorOnlyMode) {
    return (
      <DndProvider>
        <div className="h-screen flex flex-col bg-muted/80">
          <div className="flex-1 flex">
            <Editor />
          </div>
          <div className="fixed bottom-1 right-1">
            <LicenseKeyButton />
          </div>
        </div>
        <SettingsDialog />
      </DndProvider>
    )
  }

  if (!workspacePath) {
    return <Welcome />
  }

  return (
    <DndProvider>
      <div
        className={cn(
          'h-screen flex flex-col',
          isMac() ? 'bg-muted/80' : 'bg-muted'
        )}
      >
        <div className="flex-1 overflow-hidden flex">
          <div className="group/side flex">
            <FileExplorer />
            <CollectionView />
          </div>
          <div className="flex-1 flex">
            <Editor />
          </div>
          <div className="fixed bottom-1 right-1">
            <LicenseKeyButton />
          </div>
        </div>
      </div>
      <SettingsDialog />
      <CommandMenu />
      <ImagePreviewDialog />
    </DndProvider>
  )
}

function LicenseKeyButton() {
  const { status, checkLicense } = useLicenseStore(
    useShallow((s) => ({
      status: s.status,
      checkLicense: s.checkLicense,
    }))
  )
  const openSettingsWithTab = useUIStore((s) => s.openSettingsWithTab)

  useEffect(() => {
    // Skip license check when offline for now
    // TODO: Consider implementing offline license validation or caching mechanism
    if (navigator.onLine) {
      checkLicense()
    }
  }, [checkLicense])

  if (status === 'valid') {
    return null
  }

  return (
    <Button
      variant="ghost"
      className="text-xs h-5 px-2 text-muted-foreground hover:bg-transparent dark:hover:bg-transparent hover:text-foreground"
      onClick={() => openSettingsWithTab('license')}
    >
      License Key
    </Button>
  )
}
