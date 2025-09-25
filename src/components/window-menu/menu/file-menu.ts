import { MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'

export async function createFileMenu({
  createNote,
}: {
  createNote: () => void
}) {
  return await Submenu.new({
    text: 'File',
    items: [
      await MenuItem.new({
        id: 'new-note',
        text: 'New Note',
        accelerator: 'CmdOrCtrl+N',
        action: () => createNote(),
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
