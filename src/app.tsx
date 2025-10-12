import './globals.css'
import { useEffect } from 'react'
import { Editor } from './components/editor/editor'
import { FileExplorer } from './components/file-explorer/file-explorer'
import { LicenseActivation } from './components/license/license-activation'
import { Tabbar } from './components/tabbar/tabbar'
import { Welcome } from './components/welcome/welcome'
import { useWorkspaceStore } from './store/workspace-store'

export function App() {
  const { workspacePath, isLoading, initializeWorkspace } = useWorkspaceStore()

  useEffect(() => {
    initializeWorkspace()
  }, [initializeWorkspace])

  if (isLoading) {
    return null
  }

  return (
    <LicenseActivation>
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
    </LicenseActivation>
  )
}
