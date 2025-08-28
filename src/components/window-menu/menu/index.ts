import { Menu } from '@tauri-apps/api/menu'
import { createFileMenu } from './file-menu'
import { createMditMenu } from './mdit-menu'

export async function installWindowMenu({
  newNote,
  openNote,
}: {
  newNote: () => void
  openNote: () => void
}) {
  const menu = await Menu.new({
    items: [
      await createMditMenu(),
      await createFileMenu({
        newNote,
        openNote,
      }),
    ],
  })
  menu.setAsAppMenu()
}
