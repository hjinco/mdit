import { create } from 'zustand'

type SettingsTab = 'preferences' | 'ai'

type UIStore = {
  isFileExplorerOpen: boolean
  toggleFileExplorer: () => void
  setFileExplorerOpen: (isOpen: boolean) => void
  fileExplorerWidth: number
  setFileExplorerWidth: (width: number) => void
  isFileExplorerResizing: boolean
  setFileExplorerResizing: (isResizing: boolean) => void
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
  fileExplorerWidth: 256,
  setFileExplorerWidth: (width) => set({ fileExplorerWidth: width }),
  isFileExplorerResizing: false,
  setFileExplorerResizing: (isResizing) =>
    set({ isFileExplorerResizing: isResizing }),
  isSettingsDialogOpen: false,
  setSettingsDialogOpen: (isOpen) => set({ isSettingsDialogOpen: isOpen }),
  settingsInitialTab: null,
  openSettingsWithTab: (tab) =>
    set({
      isSettingsDialogOpen: true,
      settingsInitialTab: tab,
    }),
}))
