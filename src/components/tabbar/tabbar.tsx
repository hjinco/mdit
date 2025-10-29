import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { TooltipProvider } from '@/ui/tooltip'
import { MoreButton } from './ui/more-button'
import { NewNoteButton } from './ui/new-note-button'
import { Tab } from './ui/tab'
import { ToggleButton } from './ui/toggle-button'

export function Tabbar() {
  const {
    isFileExplorerOpen,
    fileExplorerWidth,
    isFileExplorerResizing,
    toggleFileExplorer,
  } = useUIStore(
    useShallow((s) => ({
      isFileExplorerOpen: s.isFileExplorerOpen,
      fileExplorerWidth: s.fileExplorerWidth,
      isFileExplorerResizing: s.isFileExplorerResizing,
      toggleFileExplorer: s.toggleFileExplorer,
    }))
  )
  const workspacePath = useWorkspaceStore((s) => s.workspacePath)
  const tab = useTabStore((s) => s.tab)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        toggleFileExplorer()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleFileExplorer])

  if (!workspacePath) {
    return <div className="h-10 rounded-t-md" data-tauri-drag-region />
  }

  return (
    <div className="flex h-10" data-tauri-drag-region>
      <div
        className={cn(
          'h-10 flex items-center justify-end',
          !isFileExplorerResizing && 'transition-[width] duration-220',
          isFileExplorerResizing && 'transition-none',
          !isFileExplorerOpen && 'bg-background w-36 rounded-tl-md'
        )}
        style={isFileExplorerOpen ? { width: fileExplorerWidth } : undefined}
        data-tauri-drag-region
      >
        <TooltipProvider delayDuration={500} skipDelayDuration={100}>
          <NewNoteButton />
          <ToggleButton
            isOpen={isFileExplorerOpen}
            onToggle={toggleFileExplorer}
          />
        </TooltipProvider>
      </div>
      <div
        className={cn(
          'flex-1 flex justify-center bg-background rounded-tr-md',
          isFileExplorerOpen && 'rounded-tl-md'
        )}
        data-tauri-drag-region
      >
        {tab && <Tab name={tab?.name || 'Untitled'} />}
      </div>
      <div className="fixed right-0 h-10 flex items-center pr-2.5">
        {tab && <MoreButton />}
      </div>
    </div>
  )
}
