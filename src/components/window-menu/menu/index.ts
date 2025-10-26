import { Menu } from '@tauri-apps/api/menu'
import type { PlateEditor } from 'platejs/react'
import { createEditMenu } from './edit-menu'
import { createFileMenu } from './file-menu'
import { createHelpMenu } from './help-menu'
import { createMditMenu } from './mdit-menu'
import { createViewMenu } from './view-menu'
import { createWindowMenu } from './window-menu'

export async function installWindowMenu({
  editor,
  createNote,
  openWorkspace,
  toggleFileExplorer,
  zoomIn,
  zoomOut,
  resetZoom,
}: {
  editor: PlateEditor
  createNote: () => void | Promise<void>
  openWorkspace: () => void | Promise<void>
  toggleFileExplorer: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}) {
  const menu = await Menu.new({
    items: [
      await createMditMenu(),
      await createFileMenu({
        createNote,
        openWorkspace,
      }),
      await createEditMenu({
        editor,
      }),
      await createViewMenu({
        toggleFileExplorer,
        zoomIn,
        zoomOut,
        resetZoom,
      }),
      await createWindowMenu(),
      await createHelpMenu(),
    ],
  })
  menu.setAsAppMenu()
}
