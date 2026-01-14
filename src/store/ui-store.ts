import { create } from 'zustand'
import type { SettingsTab } from '@/components/settings/ui/navigation'
import { UserSettingsRepository } from '@/repositories/user-settings-repository'

export type FontScaleUpdater = number | ((current: number) => number)

const userSettingsRepository = new UserSettingsRepository()

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
  fontScale: number
  setFontScale: (updater: FontScaleUpdater) => void
  increaseFontScale: () => void
  decreaseFontScale: () => void
  resetFontScale: () => void
}

const FILE_EXPLORER_STORAGE_KEY = 'isFileExplorerOpen'

const getInitialFileExplorerOpen = () => {
  if (typeof window === 'undefined') return true

  const stored = localStorage.getItem(FILE_EXPLORER_STORAGE_KEY)
  return stored === null ? true : stored === 'true'
}

const persistFileExplorerOpen = (isOpen: boolean) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(FILE_EXPLORER_STORAGE_KEY, String(isOpen))
}

export const useUIStore = create<UIStore>((set) => ({
  isFileExplorerOpen: getInitialFileExplorerOpen(),
  setFileExplorerOpen: (isOpen) => {
    persistFileExplorerOpen(isOpen)
    set({ isFileExplorerOpen: isOpen })
  },
  toggleFileExplorerOpen: () =>
    set((state) => {
      const nextValue = !state.isFileExplorerOpen
      persistFileExplorerOpen(nextValue)
      return { isFileExplorerOpen: nextValue }
    }),
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
  fontScale: userSettingsRepository.getFontScale(),
  setFontScale: (updater) =>
    set((state) => {
      const nextValue =
        typeof updater === 'function'
          ? (updater as (value: number) => number)(state.fontScale)
          : updater
      const clampedValue = userSettingsRepository.setFontScale(nextValue)
      return { fontScale: clampedValue }
    }),
  increaseFontScale: () =>
    set((state) => {
      const newValue = userSettingsRepository.increaseFontScale(state.fontScale)
      return { fontScale: newValue }
    }),
  decreaseFontScale: () =>
    set((state) => {
      const newValue = userSettingsRepository.decreaseFontScale(state.fontScale)
      return { fontScale: newValue }
    }),
  resetFontScale: () => {
    const resetValue = userSettingsRepository.resetFontScale()
    set({ fontScale: resetValue })
  },
}))
