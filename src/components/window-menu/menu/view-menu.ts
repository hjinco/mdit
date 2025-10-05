import { MenuItem, Submenu } from '@tauri-apps/api/menu'

export async function createViewMenu({
  toggleFileExplorer,
}: {
  toggleFileExplorer: () => void
}) {
  return await Submenu.new({
    text: 'View',
    items: [
      await MenuItem.new({
        id: 'toggle-explorer',
        text: 'Toggle File Explorer',
        accelerator: 'CmdOrCtrl+\\',
        action: () => toggleFileExplorer(),
      }),
    ],
  })
}
