import { MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'

export async function createFileMenu({
  createNote,
  openWorkspace,
}: {
  createNote: () => void | Promise<void>
  openWorkspace: () => void | Promise<void>
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
      await MenuItem.new({
        id: 'open-folder',
        text: 'Open Folder...',
        accelerator: 'CmdOrCtrl+O',
        action: () => openWorkspace(),
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
