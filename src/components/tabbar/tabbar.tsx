import { rename } from '@tauri-apps/plugin-fs'
import { useCallback } from 'react'
import { useTabContext } from '@/contexts/tab-context'
import { ModeToggle } from './ui/mode-toggle'
import { Tab } from './ui/tab'

export function Tabbar() {
  const { tab, setTab } = useTabContext()

  const renameTab = useCallback(
    async (name: string) => {
      if (!tab) return
      const path = `${tab.path.split('/').slice(0, -1).join('/')}/${name}.md`
      await rename(tab.path, path)
      setTab({ ...tab, path, name })
    },
    [tab, setTab]
  )

  if (!tab) return <div className="h-10" data-tauri-drag-region />

  return (
    <div className="flex items-center justify-center" data-tauri-drag-region>
      <Tab name={tab?.name || 'Untitled'} onRename={renameTab} />
      <div className="fixed top-1 right-1">
        <ModeToggle />
      </div>
    </div>
  )
}
