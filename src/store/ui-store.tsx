import { create } from 'zustand'

type SettingsTab = 'preferences' | 'ai'

type UIStore = {
  isFileExplorerOpen: boolean
  toggleFileExplorer: () => void
  setFileExplorerOpen: (isOpen: boolean) => void
  isSettingsDialogOpen: boolean
  setSettingsDialogOpen: (isOpen: boolean) => void
  settingsInitialTab: SettingsTab | null
  openSettingsWithTab: (tab: SettingsTab) => void
}

export const useUIStore = create<UIStore>((set) => ({
  isFileExplorerOpen: true,
  toggleFileExplorer: () =>
    set((state) => ({ isFileExplorerOpen: !state.isFileExplorerOpen })),
  setFileExplorerOpen: (isOpen) => set({ isFileExplorerOpen: isOpen }),
  isSettingsDialogOpen: false,
  setSettingsDialogOpen: (isOpen) => set({ isSettingsDialogOpen: isOpen }),
  settingsInitialTab: null,
  openSettingsWithTab: (tab) =>
    set({
      isSettingsDialogOpen: true,
      settingsInitialTab: tab,
    }),
}))
