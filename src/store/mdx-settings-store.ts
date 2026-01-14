import { create } from 'zustand'

const MDX_ENABLED_KEY = 'mdit-mdx-enabled'

type MDXSettingsStore = {
  isMDXEnabled: boolean
  setMDXEnabled: (enabled: boolean) => void
}

const getInitialMDXEnabled = (): boolean => {
  const stored = localStorage.getItem(MDX_ENABLED_KEY)
  if (stored === null) return false
  return stored === 'true'
}

export const useMDXSettingsStore = create<MDXSettingsStore>((set) => ({
  isMDXEnabled: getInitialMDXEnabled(),
  setMDXEnabled: (enabled: boolean) => {
    localStorage.setItem(MDX_ENABLED_KEY, String(enabled))
    set({ isMDXEnabled: enabled })
  },
}))
