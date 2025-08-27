import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from '@/ui/sonner'
import { App } from './app'
import { Updater } from './components/updater/updater'
import { TabProvider } from './contexts/tab-context'
import { ThemeProvider } from './contexts/theme-context'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <TabProvider>
        <App />
      </TabProvider>
    </ThemeProvider>
    <Updater />
    <Toaster />
  </React.StrictMode>
)
