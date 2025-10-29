import { useEffect } from 'react'
import { CommandPalette } from './components/command-palette/command-palette'
import { Editor } from './components/editor/editor'
import { FileExplorer } from './components/file-explorer/file-explorer'
import { LicenseTempDialog } from './components/license/license-temp-dialog'
import { SettingsDialog } from './components/settings/settings'
import { Tabbar } from './components/tabbar/tabbar'
import { Welcome } from './components/welcome/welcome'
import { DndProvider } from './contexts/dnd-provider'
import { useFontScale } from './hooks/use-font-scale'
import { cn } from './lib/utils'
import { useLicenseStore } from './store/license-store'
import { useUIStore } from './store/ui-store'
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

  if (!workspacePath) {
    return <Welcome />
  }

  return (
    <DndProvider>
      <Background>
        <Tabbar />
        <div className="flex-1 overflow-hidden flex">
          <FileExplorer />
          <Editor />
          <div className="fixed bottom-1 right-1">
            <LicenseTempDialog />
          </div>
        </div>
      </Background>
      <SettingsDialog />
      <CommandPalette />
    </DndProvider>
  )
}

function Background({ children }: { children: React.ReactNode }) {
  const isFileExplorerOpen = useUIStore((s) => s.isFileExplorerOpen)
  return (
    <div
      className={cn(
        'h-screen flex flex-col p-1 bg-background/50',
        isFileExplorerOpen && 'pl-0'
      )}
    >
      {children}
    </div>
  )
}
