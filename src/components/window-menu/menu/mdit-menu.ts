import { PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'

export async function createMditMenu() {
  return await Submenu.new({
    text: 'Mdit',
    items: [
      await PredefinedMenuItem.new({
        text: 'Quit',
        item: 'Quit',
      }),
    ],
  })
}
