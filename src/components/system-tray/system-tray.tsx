import { LogicalPosition } from '@tauri-apps/api/dpi'
import { Image } from '@tauri-apps/api/image'
import { Menu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { join, resourceDir } from '@tauri-apps/api/path'
import { TrayIcon } from '@tauri-apps/api/tray'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { useEffect } from 'react'

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
  const resDir = await resourceDir()
  const iconPath = await join(resDir, 'icons', 'trayTemplate.png')
  const icon = await Image.fromPath(iconPath)

  const tray = await TrayIcon.getById('tray')

  if (tray) {
    return tray
  }

  return await TrayIcon.new({
    id: 'tray',
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
        await PredefinedMenuItem.new({
          item: 'Separator',
        }),
        await PredefinedMenuItem.new({
          item: 'Quit',
        }),
      ],
    }),
  })
}

export function SystemTray() {
  useEffect(() => {
    const shortcut = 'CmdOrCtrl+Alt+N'

    register(shortcut, () => {
      createQuickNoteWindow()
    })

    const trayPromise = createSystemTray().catch(() => {
      return null
    })

    return () => {
      unregister(shortcut)
      trayPromise.then((tray) => {
        tray?.close()
      })
    }
  }, [])
  return null
}
