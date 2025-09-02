import { Submenu } from '@tauri-apps/api/menu'

export async function createViewMenu() {
  return await Submenu.new({
    text: 'View',
    items: [],
  })
}
