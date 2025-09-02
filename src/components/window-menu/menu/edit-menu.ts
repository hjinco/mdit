import { PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'

export async function createEditMenu() {
  return await Submenu.new({
    text: 'Edit',
    items: [
      await PredefinedMenuItem.new({
        text: 'Undo',
        item: 'Undo',
      }),
      await PredefinedMenuItem.new({
        text: 'Redo',
        item: 'Redo',
      }),
      await PredefinedMenuItem.new({
        text: 'Separator',
        item: 'Separator',
      }),
      await PredefinedMenuItem.new({
        text: 'Cut',
        item: 'Cut',
      }),
      await PredefinedMenuItem.new({
        text: 'Copy',
        item: 'Copy',
      }),
      await PredefinedMenuItem.new({
        text: 'Paste',
        item: 'Paste',
      }),
      await PredefinedMenuItem.new({
        text: 'Select All',
        item: 'SelectAll',
      }),
    ],
  })
}
