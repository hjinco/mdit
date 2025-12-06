import { PlateController } from 'platejs/react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from '@/ui/sonner'
import { ErrorBoundary } from './components/error-boundary/error-boundary'
import { WindowMenu } from './components/window-menu/window-menu'
import { ConfettiProvider } from './contexts/confetti-context'
import { DndProvider } from './contexts/dnd-provider'
import { DropProvider } from './contexts/drop-context'
import { ThemeProvider } from './contexts/theme-context'
import { Router } from './router'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ConfettiProvider>
          <PlateController>
            <DropProvider>
              <DndProvider>
                <Router />
              </DndProvider>
            </DropProvider>
          </PlateController>
        </ConfettiProvider>
      </ThemeProvider>
      <WindowMenu />
      <Toaster />
    </ErrorBoundary>
  </React.StrictMode>
)
