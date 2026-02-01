import { invoke } from '@tauri-apps/api/core'
import { useEffect } from 'react'
import {
  Route,
  Switch,
  useLocation,
  useSearch,
  Router as WouterRouter,
} from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { App } from '@/app'
import { EditNote } from './components/quick-note/edit-note'
import { QuickNote } from './components/quick-note/quick-note'
import { SystemTray } from './components/system-tray/system-tray'
import { Updater } from './components/updater/updater'
import { useCurrentWindowLabel } from './hooks/use-current-window-label'

function EditRoute() {
  const search = useSearch()
  const params = new URLSearchParams(search)
  const path = params.get('path') ?? ''
  return <EditNote filePath={path} />
}

function AppRouter() {
  const label = useCurrentWindowLabel()
  const [location] = useLocation()

  useEffect(() => {
    if (label === 'main' && location === '/') {
      invoke('show_main_window').catch(console.error)
    }
  }, [label, location])

  if (label === null) {
    return null
  }

  return (
    <Switch>
      <Route path="/quick-note">
        <QuickNote />
      </Route>
      <Route path="/edit">
        <EditRoute />
      </Route>
      <Route path="/">
        <App />
        <SystemTray />
        <Updater />
      </Route>
      <Route>Not Found</Route>
    </Switch>
  )
}

export function Router() {
  return (
    <WouterRouter hook={useHashLocation}>
      <AppRouter />
    </WouterRouter>
  )
}
