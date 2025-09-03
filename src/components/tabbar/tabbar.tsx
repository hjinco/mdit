import { useTabStore } from '@/store/tab-store'
import { ModeToggle } from './ui/mode-toggle'
import { Tab } from './ui/tab'

export function Tabbar() {
  const { tab, renameNote } = useTabStore()

  if (!tab) return <div className="h-10" data-tauri-drag-region />

  return (
    <div className="flex items-center justify-center" data-tauri-drag-region>
      <Tab name={tab?.name || 'Untitled'} onRename={renameNote} />
      <div className="fixed top-1 right-1">
        <ModeToggle />
      </div>
    </div>
  )
}
