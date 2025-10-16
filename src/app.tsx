import './globals.css'
import { useEffect } from 'react'
import { Editor } from './components/editor/editor'
import { FileExplorer } from './components/file-explorer/file-explorer'
import { Tabbar } from './components/tabbar/tabbar'
import { Welcome } from './components/welcome/welcome'
import { DndProvider } from './contexts/dnd-provider'
import { useLicenseStore } from './store/license-store'
import { useWorkspaceStore } from './store/workspace-store'

export function App() {
  const { workspacePath, isLoading, initializeWorkspace } = useWorkspaceStore()
  const checkLicenseAndTrial = useLicenseStore((s) => s.checkLicenseAndTrial)

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
        </div>
      </div>
      {/* <LicenseActivationDialog /> */}
    </DndProvider>
  )
}
