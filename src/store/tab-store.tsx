import { open, save } from '@tauri-apps/plugin-dialog'
import { rename, writeTextFile } from '@tauri-apps/plugin-fs'
import { create } from 'zustand'

export type Tab = {
  path: string
  name: string
}

type TabStore = {
  tab: Tab | null
  newNote: () => Promise<void>
  openNote: () => Promise<void>
  renameNote: (name: string) => Promise<void>
}

export const useTabStore = create<TabStore>((set, get) => ({
  tab: null,
  openNote: async () => {
    const path = await open({
      multiple: false,
      directory: false,
      title: 'Open Note',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (path) {
      const name = path.split('/').pop()?.split('.').shift()
      if (name) {
        set({ tab: { path, name } })
      }
    }
  },
  newNote: async () => {
    const path = await save({
      title: 'New Note',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (path) {
      const name = path.split('/').pop()?.split('.').shift()
      if (name) {
        await writeTextFile(path, '')
        set({ tab: { path, name } })
      }
    }
  },
  renameNote: async (name: string) => {
    const tab = get().tab
    if (!tab) return
    const path = `${tab.path.split('/').slice(0, -1).join('/')}/${name}.md`
    await rename(tab.path, path)
    set({ tab: { ...tab, path, name } })
  },
}))
