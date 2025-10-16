import { readTextFile } from '@tauri-apps/plugin-fs'
import { create } from 'zustand'

let tabIdCounter = 0

export type Tab = {
  id: number
  path: string
  name: string
  content: string
}

type TabStore = {
  tab: Tab | null
  isSaved: boolean
  openTab: (path: string) => Promise<void>
  openNote: (path: string) => Promise<void>
  closeTab: (path: string) => void
  renameTab: (oldPath: string, newPath: string) => void
  setTabSaved: (isSaved: boolean) => void
}

export const useTabStore = create<TabStore>((set, get) => ({
  tab: null,
  isSaved: true,
  openTab: async (path: string) => {
    if (!path.endsWith('.md')) {
      return
    }

    const content = await readTextFile(path)
    const name = path.split('/').pop()?.split('.').shift()

    if (name) {
      set({
        tab: { id: ++tabIdCounter, path, name, content },
        isSaved: true,
      })
    }
  },
  openNote: async (path: string) => {
    await get().openTab(path)
  },
  closeTab: (path) => {
    const tab = get().tab

    if (!tab || tab.path !== path) {
      return
    }

    set({ tab: null })
  },
  renameTab: (oldPath, newPath) => {
    const tab = get().tab

    if (!tab || tab.path !== oldPath) {
      return
    }

    const name = newPath.split('/').pop()?.split('.').shift()

    if (!name) {
      set({ tab: null })
      return
    }

    set({
      tab: {
        ...tab,
        path: newPath,
        name,
      },
    })
  },
  setTabSaved: (isSaved) => {
    set({
      isSaved,
    })
  },
}))
