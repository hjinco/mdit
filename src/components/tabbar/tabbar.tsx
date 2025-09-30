import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { ModeToggle } from './ui/mode-toggle'
import { Tab } from './ui/tab'

export function Tabbar() {
  const workspacePath = useWorkspaceStore((s) => s.workspacePath)
  const tab = useTabStore((s) => s.tab)

  if (!tab)
    return (
      <div className="h-10" data-tauri-drag-region>
        <div
          className={cn('w-64 h-10', workspacePath && 'bg-muted')}
          data-tauri-drag-region
        />
      </div>
    )

  return (
    <div className="flex" data-tauri-drag-region>
      <div className="w-64 bg-muted" data-tauri-drag-region />
      <div className="flex-1 flex justify-center" data-tauri-drag-region>
        <Tab name={tab?.name || 'Untitled'} />
      </div>
      <div className="fixed top-1 right-1">
        <ModeToggle />
      </div>
    </div>
  )
}
