import { useEffect } from 'react'
import { Editor } from './components/editor/editor'
import { FileExplorer } from './components/file-explorer/file-explorer'
import { LicenseTempDialog } from './components/license/license-temp-dialog'
import { SettingsDialog } from './components/settings/settings'
import { Tabbar } from './components/tabbar/tabbar'
import { Welcome } from './components/welcome/welcome'
import { DndProvider } from './contexts/dnd-provider'
import { useFontScale } from './hooks/use-font-scale'
import { useLicenseStore } from './store/license-store'
import { useWorkspaceStore } from './store/workspace-store'

export function App() {
  const { workspacePath, isLoading, initializeWorkspace } = useWorkspaceStore()
  const checkLicenseAndTrial = useLicenseStore((s) => s.checkLicenseAndTrial)
  useFontScale()

  useEffect(() => {
    initializeWorkspace()
    checkLicenseAndTrial()
  }, [initializeWorkspace, checkLicenseAndTrial])

  if (isLoading) {
    return null
  }

  return (
    <DndProvider>
      <div className="h-screen flex flex-col">
        <Tabbar />
        <div className="flex-1 overflow-hidden flex">
          {workspacePath ? (
            <>
              <FileExplorer />
              <Editor />
            </>
          ) : (
            <Welcome />
          )}
          <div className="fixed bottom-0 right-0">
            <LicenseTempDialog />
          </div>
        </div>
      </div>
      <SettingsDialog />
      {/* <LicenseActivationDialog /> */}
    </DndProvider>
  )
}
