import { useEffect } from 'react'
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
  const isFileExplorerOpen = useUIStore((state) => state.isFileExplorerOpen)
  const toggleFileExplorer = useUIStore((state) => state.toggleFileExplorer)
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
    return <div className="h-10" data-tauri-drag-region />
  }

  return (
    <div className="flex h-10" data-tauri-drag-region>
      <div
        className={cn(
          'w-64 bg-muted flex items-center justify-end transition-[width] duration-250',
          isFileExplorerOpen ? 'border-r' : 'bg-background w-36'
        )}
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
      <div className="flex-1 flex justify-center" data-tauri-drag-region>
        {tab && <Tab name={tab?.name || 'Untitled'} />}
      </div>
      <div className="flex items-center pr-1.5">{tab && <MoreButton />}</div>
    </div>
  )
}
