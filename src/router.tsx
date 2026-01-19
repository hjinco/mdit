import { invoke } from '@tauri-apps/api/core'
import { useEffect } from 'react'
import { App } from '@/app'
import { EditNote } from './components/quick-note/edit-note'
import { QuickNote } from './components/quick-note/quick-note'
import { SystemTray } from './components/system-tray/system-tray'
import { Updater } from './components/updater/updater'
import { useCurrentWindowLabel } from './hooks/use-current-window-label'

export function Router() {
  const label = useCurrentWindowLabel()

  useEffect(() => {
    invoke('show_main_window')
  }, [])

  if (label === null) {
    return null
  }

  if (label.startsWith('quick-note')) {
    return <QuickNote />
  }

  if (label === 'edit') {
    return <EditNote />
  }

  return (
    <>
      <App />
      <SystemTray />
      <Updater />
    </>
  )
}
