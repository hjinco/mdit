import { MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'

export async function createMditMenu({
  toggleSettings,
}: {
  toggleSettings: () => void
}) {
  return await Submenu.new({
    text: 'Mdit',
    items: [
      await PredefinedMenuItem.new({
        text: 'Services',
        item: 'Services',
      }),
      await PredefinedMenuItem.new({
        text: 'Separator',
        item: 'Separator',
      }),
      await MenuItem.new({
        id: 'settings',
        text: 'Settings…',
        accelerator: 'CmdOrCtrl+;',
        action: () => toggleSettings(),
      }),
      await PredefinedMenuItem.new({
        text: 'Separator',
        item: 'Separator',
      }),
      await PredefinedMenuItem.new({
        text: 'Hide',
        item: 'Hide',
      }),
      await PredefinedMenuItem.new({
        text: 'Hide Others',
        item: 'HideOthers',
      }),
      await PredefinedMenuItem.new({
        text: 'Separator',
        item: 'Separator',
      }),
      await PredefinedMenuItem.new({
        text: 'Quit',
        item: 'Quit',
      }),
    ],
  })
}
