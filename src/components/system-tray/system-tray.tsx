import { defaultWindowIcon } from '@tauri-apps/api/app'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { Menu } from '@tauri-apps/api/menu'
import { TrayIcon } from '@tauri-apps/api/tray'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { register } from '@tauri-apps/plugin-global-shortcut'
import { useEffect } from 'react'

const createQuickNoteWindow = () => {
  new WebviewWindow('quick-note', {
    url: '/index.html',
    title: 'Mdit',
    width: 800,
    height: 600,
    titleBarStyle: 'overlay',
    hiddenTitle: true,
    visible: false,
    trafficLightPosition: new LogicalPosition(18, 22),
  })
}

async function createSystemTray() {
  return await TrayIcon.new({
    icon: (await defaultWindowIcon()) as unknown as string,
    menu: await Menu.new({
      items: [
        {
          id: 'Quick Note',
          text: 'Quick Note',
          action: () => {
            createQuickNoteWindow()
          },
          accelerator: 'CmdOrCtrl+Shift+N',
        },
      ],
    }),
  })
}

export function SystemTray() {
  useEffect(() => {
    const tray = createSystemTray()
    register('CmdOrCtrl+Shift+N', () => {
      createQuickNoteWindow()
    })

    return () => {
      tray.then((tray) => tray.close())
    }
  }, [])
  return null
}
