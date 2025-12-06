import { useFocusMode } from '@/contexts/focus-mode-context'
import { useIsFullscreen } from '@/hooks/use-is-fullscreen'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { isMac } from '@/utils/platform'
import { HistoryNavigation } from './history-navigation'
import { MoreButton } from './more-button'
import { Tab } from './tab'

export function Header() {
  const isFileExplorerOpen = useUIStore((s) => s.isFileExplorerOpen)
  const isCollectionViewOpen = useWorkspaceStore(
    (s) => s.currentCollectionPath !== null
  )
  const workspacePath = useWorkspaceStore((s) => s.workspacePath)
  const isFullscreen = useIsFullscreen()
  const { isFocusMode } = useFocusMode()
  const isScrolling = useEditorStore((s) => s.isScrolling)

  return (
    <div
      className={cn(
        'absolute z-40 top-0 left-0 bg-background/70 backdrop-blur-sm w-full h-12 flex items-center justify-center transition-[opacity] duration-600',
        (isFocusMode || isScrolling) && 'pointer-events-none opacity-0'
      )}
      {...(isMac() && { 'data-tauri-drag-region': '' })}
    >
      <div
        className={cn(
          'absolute',
          !isFileExplorerOpen && !isCollectionViewOpen
            ? isMac() && !isFullscreen
              ? 'left-30'
              : 'left-12'
            : 'left-2',
          !workspacePath && (isMac() && !isFullscreen ? 'left-20' : 'left-2')
        )}
      >
        <HistoryNavigation />
      </div>
      <Tab />
      <div className="absolute right-2">
        <MoreButton />
      </div>
    </div>
  )
}
