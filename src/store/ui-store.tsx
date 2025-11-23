import { create } from 'zustand'
import type { SettingsTab } from '@/components/settings/ui/navigation'

type UIStore = {
  isFileExplorerOpen: boolean
  setFileExplorerOpen: (isOpen: boolean) => void
  toggleFileExplorerOpen: () => void
  isSettingsDialogOpen: boolean
  setSettingsDialogOpen: (isOpen: boolean) => void
  toggleSettingsDialogOpen: () => void
  settingsInitialTab: SettingsTab | null
  openSettingsWithTab: (tab: SettingsTab) => void
  isCommandMenuOpen: boolean
  setCommandMenuOpen: (isOpen: boolean) => void
  openCommandMenu: () => void
  closeCommandMenu: () => void
  imagePreviewPath: string | null
  setImagePreviewPath: (path: string | null) => void
  openImagePreview: (path: string) => void
  closeImagePreview: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  isFileExplorerOpen: true,
  setFileExplorerOpen: (isOpen) => set({ isFileExplorerOpen: isOpen }),
  toggleFileExplorerOpen: () =>
    set((state) => ({ isFileExplorerOpen: !state.isFileExplorerOpen })),
  isSettingsDialogOpen: false,
  setSettingsDialogOpen: (isOpen) => set({ isSettingsDialogOpen: isOpen }),
  toggleSettingsDialogOpen: () =>
    set((state) => ({ isSettingsDialogOpen: !state.isSettingsDialogOpen })),
  settingsInitialTab: null,
  openSettingsWithTab: (tab) =>
    set({
      isSettingsDialogOpen: true,
      settingsInitialTab: tab,
    }),
  isCommandMenuOpen: false,
  setCommandMenuOpen: (isOpen) => set({ isCommandMenuOpen: isOpen }),
  openCommandMenu: () => set({ isCommandMenuOpen: true }),
  closeCommandMenu: () => set({ isCommandMenuOpen: false }),
  imagePreviewPath: null,
  setImagePreviewPath: (path) => set({ imagePreviewPath: path }),
  openImagePreview: (path) => set({ imagePreviewPath: path }),
  closeImagePreview: () => set({ imagePreviewPath: null }),
}))
