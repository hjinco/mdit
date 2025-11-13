import { useEffect } from 'react'
import { CollectionView } from './components/collection-view/collection-view'
import { CommandMenu } from './components/command-menu/command-menu'
import { Editor } from './components/editor/editor'
import { FileExplorer } from './components/file-explorer/file-explorer'
import { ImagePreviewDialog } from './components/image-preview/image-preview-dialog'
import { LicenseTempDialog } from './components/license/license-temp-dialog'
import { SettingsDialog } from './components/settings/settings'
import { Welcome } from './components/welcome/welcome'
import { DndProvider } from './contexts/dnd-provider'
import { useAutoIndexing } from './hooks/use-auto-indexing'
import { useFontScale } from './hooks/use-font-scale'
import { useLicenseStore } from './store/license-store'
import { useWorkspaceStore } from './store/workspace-store'

export function App() {
  const { workspacePath, isLoading, initializeWorkspace } = useWorkspaceStore()
  const checkLicenseAndTrial = useLicenseStore((s) => s.checkLicenseAndTrial)
  useFontScale()
  useAutoIndexing(workspacePath)

  useEffect(() => {
    initializeWorkspace()
    checkLicenseAndTrial()
  }, [initializeWorkspace, checkLicenseAndTrial])

  if (isLoading) {
    return null
  }

  if (!workspacePath) {
    return <Welcome />
  }

  return (
    <DndProvider>
      <div className="h-screen flex flex-col bg-background/60">
        <div className="flex-1 overflow-hidden flex">
          <div className="group/side flex">
            <FileExplorer />
            <CollectionView />
          </div>
          <div className="flex-1 flex">
            <Editor />
          </div>
          <div className="fixed bottom-1 right-1">
            <LicenseTempDialog />
          </div>
        </div>
      </div>
      <SettingsDialog />
      <CommandMenu />
      <ImagePreviewDialog />
    </DndProvider>
  )
}
