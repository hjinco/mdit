import { LogicalPosition } from '@tauri-apps/api/dpi'
import { Image } from '@tauri-apps/api/image'
import { Menu, PredefinedMenuItem } from '@tauri-apps/api/menu'
import { resourceDir } from '@tauri-apps/api/path'
import { TrayIcon } from '@tauri-apps/api/tray'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { register, unregister } from '@tauri-apps/plugin-global-shortcut'
import { join } from 'pathe'
import { useEffect } from 'react'

const createQuickNoteWindow = () => {
  // Generate a unique window label to allow multiple quick-note windows.
  const windowLabel = `quick-note-${crypto.randomUUID()}`

  new WebviewWindow(windowLabel, {
    url: '/index.html#/quick-note',
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
  const iconPath = join(resDir, 'icons', 'trayTemplate.png')
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

    register(shortcut, (event) => {
      if (event.state === 'Released') {
        createQuickNoteWindow()
      }
    })

    const trayPromise = createSystemTray().catch(() => null)

    const cleanup = async () => {
      await unregister(shortcut).catch(() => {})

      const tray = await trayPromise
      await tray?.close().catch(() => {})
    }

    return () => {
      cleanup().catch(() => {})
    }
  }, [])
  return null
}
