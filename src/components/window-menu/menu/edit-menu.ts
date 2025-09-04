import { MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu'
import type { PlateEditor } from 'platejs/react'
import { selectAllLikeCmdA } from '@/components/editor/plugins/shortcuts-kit'

export async function createEditMenu({ editor }: { editor: PlateEditor }) {
  return await Submenu.new({
    text: 'Edit',
    items: [
      await PredefinedMenuItem.new({
        text: 'Undo',
        item: 'Undo',
      }),
      await PredefinedMenuItem.new({
        text: 'Redo',
        item: 'Redo',
      }),
      await PredefinedMenuItem.new({
        text: 'Separator',
        item: 'Separator',
      }),
      await PredefinedMenuItem.new({
        text: 'Cut',
        item: 'Cut',
      }),
      await PredefinedMenuItem.new({
        text: 'Copy',
        item: 'Copy',
      }),
      await PredefinedMenuItem.new({
        text: 'Paste',
        item: 'Paste',
      }),
      await MenuItem.new({
        id: 'select-all',
        text: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        action: () => {
          if (!editor) return
          selectAllLikeCmdA(editor)
        },
      }),
    ],
  })
}
