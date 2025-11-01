import { MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'

export async function createViewMenu({
  toggleFileExplorer,
  zoomIn,
  zoomOut,
  resetZoom,
  openCommandMenu,
}: {
  toggleFileExplorer: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  openCommandMenu: () => void
}) {
  return await Submenu.new({
    text: 'View',
    items: [
      await MenuItem.new({
        id: 'command-menu',
        text: 'Command Menu…',
        accelerator: 'CmdOrCtrl+P',
        action: () => openCommandMenu(),
      }),
      await PredefinedMenuItem.new({
        text: 'Separator',
        item: 'Separator',
      }),
      await MenuItem.new({
        id: 'toggle-explorer',
        text: 'Toggle File Explorer',
        accelerator: 'CmdOrCtrl+\\',
        action: () => toggleFileExplorer(),
      }),
      await PredefinedMenuItem.new({
        text: 'Separator',
        item: 'Separator',
      }),
      await MenuItem.new({
        id: 'zoom-in',
        text: 'Zoom In',
        accelerator: 'CmdOrCtrl+=',
        action: () => zoomIn(),
      }),
      await MenuItem.new({
        id: 'zoom-out',
        text: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        action: () => zoomOut(),
      }),
      await MenuItem.new({
        id: 'reset-zoom',
        text: 'Reset Zoom',
        accelerator: 'CmdOrCtrl+0',
        action: () => resetZoom(),
      }),
    ],
  })
}
