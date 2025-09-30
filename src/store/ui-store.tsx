import { create } from 'zustand'

type UIStore = {
  isFileExplorerOpen: boolean
  toggleFileExplorer: () => void
  setFileExplorerOpen: (isOpen: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  isFileExplorerOpen: true,
  toggleFileExplorer: () =>
    set((state) => ({ isFileExplorerOpen: !state.isFileExplorerOpen })),
  setFileExplorerOpen: (isOpen) => set({ isFileExplorerOpen: isOpen }),
}))
