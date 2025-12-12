import { LogicalPosition } from '@tauri-apps/api/dpi'
import { Image } from '@tauri-apps/api/image'
import { Menu } from '@tauri-apps/api/menu'
import { join, resourceDir } from '@tauri-apps/api/path'
import { TrayIcon } from '@tauri-apps/api/tray'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { useEffect, useRef } from 'react'

// Module-level singleton to track tray instance
let trayInstance: TrayIcon | null = null

const createQuickNoteWindow = () => {
  new WebviewWindow('quick-note', {
    url: '/index.html',
    title: 'Mdit',
    width: 800,
    height: 600,
    titleBarStyle: 'overlay',
    hiddenTitle: true,
    trafficLightPosition: new LogicalPosition(18, 22),
  })
}

async function createSystemTray() {
  // Return existing tray if already created
  if (trayInstance !== null) {
    return trayInstance
  }

  const resDir = await resourceDir()
  const iconPath = await join(resDir, 'icons', 'trayTemplate.png')
  const icon = await Image.fromPath(iconPath)

  const tray = await TrayIcon.new({
    icon,
    menu: await Menu.new({
      items: [
        {
          id: 'Quick Note',
          text: 'Quick Note',
          action: () => {
            createQuickNoteWindow()
          },
          accelerator: 'CmdOrCtrl+Alt+N',
        },
      ],
    }),
  })

  trayInstance = tray
  return tray
}

export function SystemTray() {
  const cleanupRef = useRef(false)

  useEffect(() => {
    const shortcut = 'CmdOrCtrl+Alt+N'

    register(shortcut, () => {
      createQuickNoteWindow()
    })

    const trayPromise = createSystemTray()

    const appWindow = getCurrentWindow()
    const closeListener = appWindow.listen('tauri://close-requested', () => {
      trayPromise.then((tray) => {
        tray.close()
        trayInstance = null
      })
    })

    return () => {
      cleanupRef.current = true
      // Cleanup: unregister shortcut and close tray
      unregister(shortcut)
      closeListener.then((unlisten) => unlisten())
      trayPromise.then((tray) => {
        // Only cleanup if this is the active instance
        if (cleanupRef.current && trayInstance === tray) {
          tray.close()
          trayInstance = null
        }
      })
    }
  }, [])
  return null
}
