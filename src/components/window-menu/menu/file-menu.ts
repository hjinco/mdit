import { MenuItem, Submenu } from '@tauri-apps/api/menu'

export async function createFileMenu({
  newNote,
  openNote,
}: {
  newNote: () => void
  openNote: () => void
}) {
  return await Submenu.new({
    text: 'File',
    items: [
      await MenuItem.new({
        id: 'new-note',
        text: 'New Note',
        accelerator: 'CmdOrCtrl+N',
        action: () => newNote(),
      }),
      await MenuItem.new({
        id: 'open-note',
        text: 'Open Note',
        accelerator: 'CmdOrCtrl+O',
        action: () => openNote(),
      }),
    ],
  })
}
