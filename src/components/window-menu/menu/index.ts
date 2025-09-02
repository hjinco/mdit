import { Menu } from '@tauri-apps/api/menu'
import { createEditMenu } from './edit-menu'
import { createFileMenu } from './file-menu'
import { createHelpMenu } from './help-menu'
import { createMditMenu } from './mdit-menu'
import { createViewMenu } from './view-menu'
import { createWindowMenu } from './window-menu'

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
      await createEditMenu(),
      await createViewMenu(),
      await createWindowMenu(),
      await createHelpMenu(),
    ],
  })
  menu.setAsAppMenu()
}
