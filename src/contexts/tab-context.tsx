import { createContext, use, useState } from 'react'

export type Tab = {
  path: string
  name: string
}

export const TabContext = createContext<{
  tab: Tab | null
  setTab: (tab: Tab) => void
}>({
  tab: null,
  setTab: () => {
    return
  },
})

export function TabProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab | null>(null)

  return (
    <TabContext.Provider value={{ tab, setTab }}>
      {children}
    </TabContext.Provider>
  )
}

export function useTabContext() {
  return use(TabContext)
}
