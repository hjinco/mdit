import { PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'

export async function createWindowMenu() {
  return await Submenu.new({
    text: 'Window',
    items: [
      await PredefinedMenuItem.new({
        text: 'Minimize',
        item: 'Minimize',
      }),
      await PredefinedMenuItem.new({
        text: 'Maximize',
        item: 'Maximize',
      }),
      await PredefinedMenuItem.new({
        text: 'Fullscreen',
        item: 'Fullscreen',
      }),
      await PredefinedMenuItem.new({
        text: 'Separator',
        item: 'Separator',
      }),
      await PredefinedMenuItem.new({
        text: 'Close Window',
        item: 'CloseWindow',
      }),
    ],
  })
}
