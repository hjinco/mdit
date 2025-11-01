import { Menu } from '@tauri-apps/api/menu'
import { createEditMenu } from './edit-menu'
import { createFileMenu } from './file-menu'
import { createHelpMenu } from './help-menu'
import { createMditMenu } from './mdit-menu'
import { createViewMenu } from './view-menu'
import { createWindowMenu } from './window-menu'

export async function installWindowMenu({
  createNote,
  openWorkspace,
  toggleFileExplorer,
  zoomIn,
  zoomOut,
  resetZoom,
  openCommandMenu,
}: {
  createNote: () => void | Promise<void>
  openWorkspace: () => void | Promise<void>
  toggleFileExplorer: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  openCommandMenu: () => void
}) {
  const menu = await Menu.new({
    items: [
      await createMditMenu(),
      await createFileMenu({
        createNote,
        openWorkspace,
      }),
      await createEditMenu(),
      await createViewMenu({
        toggleFileExplorer,
        zoomIn,
        zoomOut,
        resetZoom,
        openCommandMenu,
      }),
      await createWindowMenu(),
      await createHelpMenu(),
    ],
  })
  menu.setAsAppMenu()
}
