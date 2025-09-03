import { PlateController } from 'platejs/react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from '@/ui/sonner'
import { App } from './app'
import { Updater } from './components/updater/updater'
import { WindowMenu } from './components/window-menu/window-menu'
import { DropProvider } from './contexts/drop-context'
import { ThemeProvider } from './contexts/theme-context'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <DropProvider>
        <PlateController>
          <App />
          <WindowMenu />
        </PlateController>
      </DropProvider>
    </ThemeProvider>
    <Updater />
    <Toaster />
  </React.StrictMode>
)
