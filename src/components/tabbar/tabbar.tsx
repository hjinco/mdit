import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/ui/tooltip'
import { useTabNavigationShortcuts } from './hooks/use-tab-navigation-shortcuts'
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
  const { tab, canGoBack, canGoForward, goBack, goForward } = useTabStore(
    useShallow((s) => ({
      tab: s.tab,
      canGoBack: s.historyIndex > 0,
      canGoForward: s.historyIndex < s.history.length - 1,
      goBack: s.goBack,
      goForward: s.goForward,
    }))
  )

  useTabNavigationShortcuts(canGoBack, canGoForward, goBack, goForward)

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
    <div className="fixed w-full z-[9999] flex h-10" data-tauri-drag-region>
      <div
        className={cn(
          'fixed h-10 flex items-center justify-end z-50',
          !isFileExplorerResizing && 'transition-[width] duration-220',
          isFileExplorerResizing && 'transition-none',
          !isFileExplorerOpen && 'w-36'
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
        className="h-10 transition-[width]"
        style={{ width: isFileExplorerOpen ? fileExplorerWidth : 0 }}
      />
      {tab && (
        <>
          <div
            className="flex-1 flex items-center justify-center relative"
            data-tauri-drag-region
          >
            <div
              className={cn(
                'absolute flex items-center gap-1',
                isFileExplorerOpen ? 'left-1.5' : 'left-36.5 border-l pl-1.5'
              )}
            >
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Go back"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground hover:bg-transparent disabled:opacity-40 disabled:hover:text-muted-foreground"
                    disabled={!canGoBack}
                    data-tauri-drag-region="no-drag"
                    onClick={goBack}
                  >
                    <ChevronLeft />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Back</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Go forward"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground hover:bg-transparent disabled:opacity-40 disabled:hover:text-muted-foreground"
                    disabled={!canGoForward}
                    data-tauri-drag-region="no-drag"
                    onClick={goForward}
                  >
                    <ChevronRight />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Forward</TooltipContent>
              </Tooltip>
            </div>
            <Tab name={tab?.name || 'Untitled'} />
          </div>
          <div className="fixed right-0 h-10 flex items-center pr-2.5">
            <MoreButton />
          </div>
        </>
      )}
    </div>
  )
}
