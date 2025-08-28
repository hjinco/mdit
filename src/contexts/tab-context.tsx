import { open, save } from '@tauri-apps/plugin-dialog'
import { rename, writeTextFile } from '@tauri-apps/plugin-fs'
import { createContext, use, useCallback, useState } from 'react'

export type Tab = {
  path: string
  name: string
}

export const TabContext = createContext<{
  tab: Tab | null
  newNote: () => Promise<void>
  openNote: () => Promise<void>
  renameNote: (name: string) => Promise<void>
}>({
  tab: null,
  newNote: () => Promise.resolve(),
  openNote: () => Promise.resolve(),
  renameNote: () => Promise.resolve(),
})

export function TabProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab | null>(null)

  const openNote = useCallback(async () => {
    const path = await open({
      multiple: false,
      directory: false,
      title: 'Open Note',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (path) {
      const name = path.split('/').pop()?.split('.').shift()
      if (name) {
        setTab({ path, name })
      }
    }
  }, [])

  const newNote = useCallback(async () => {
    const path = await save({
      title: 'New Note',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (path) {
      const name = path.split('/').pop()?.split('.').shift()
      if (name) {
        await writeTextFile(path, '')
        setTab({ path, name })
      }
    }
  }, [])

  const renameNote = useCallback(
    async (name: string) => {
      if (!tab) return
      const path = `${tab.path.split('/').slice(0, -1).join('/')}/${name}.md`
      await rename(tab.path, path)
      setTab({ ...tab, path, name })
    },
    [tab]
  )

  return (
    <TabContext.Provider value={{ tab, newNote, openNote, renameNote }}>
      {children}
    </TabContext.Provider>
  )
}

export function useTabContext() {
  return use(TabContext)
}
