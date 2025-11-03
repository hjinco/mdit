import { create } from 'zustand'

const FILE_EXPLORER_WIDTH_STORAGE_KEY = 'file-explorer-width'
const DEFAULT_FILE_EXPLORER_WIDTH = 256
const FILE_EXPLORER_MIN_WIDTH = 200
const FILE_EXPLORER_MAX_WIDTH = 480

const clampFileExplorerWidth = (width: number) =>
  Math.max(FILE_EXPLORER_MIN_WIDTH, Math.min(FILE_EXPLORER_MAX_WIDTH, width))

const getStoredFileExplorerWidth = () => {
  if (typeof window === 'undefined') return null

  try {
    const storedWidth = window.localStorage.getItem(
      FILE_EXPLORER_WIDTH_STORAGE_KEY
    )
    if (!storedWidth) return null

    const parsedWidth = Number.parseInt(storedWidth, 10)
    if (Number.isNaN(parsedWidth)) {
      window.localStorage.removeItem(FILE_EXPLORER_WIDTH_STORAGE_KEY)
      return null
    }

    return clampFileExplorerWidth(parsedWidth)
  } catch (error) {
    console.error('Failed to read file explorer width from storage', error)
    return null
  }
}

const persistFileExplorerWidth = (width: number) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      FILE_EXPLORER_WIDTH_STORAGE_KEY,
      width.toString()
    )
  } catch (error) {
    console.error('Failed to persist file explorer width', error)
  }
}

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
  toggleFileExplorer: () =>
    set((state) => ({ isFileExplorerOpen: !state.isFileExplorerOpen })),
  setFileExplorerOpen: (isOpen) => set({ isFileExplorerOpen: isOpen }),
  fileExplorerWidth:
    getStoredFileExplorerWidth() ?? DEFAULT_FILE_EXPLORER_WIDTH,
  setFileExplorerWidth: (width) =>
    set(() => {
      const clampedWidth = clampFileExplorerWidth(width)
      persistFileExplorerWidth(clampedWidth)
      return { fileExplorerWidth: clampedWidth }
    }),
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
  isCommandMenuOpen: false,
  setCommandMenuOpen: (isOpen) => set({ isCommandMenuOpen: isOpen }),
  openCommandMenu: () => set({ isCommandMenuOpen: true }),
  closeCommandMenu: () => set({ isCommandMenuOpen: false }),
  imagePreviewPath: null,
  setImagePreviewPath: (path) => set({ imagePreviewPath: path }),
  openImagePreview: (path) => set({ imagePreviewPath: path }),
  closeImagePreview: () => set({ imagePreviewPath: null }),
}))
