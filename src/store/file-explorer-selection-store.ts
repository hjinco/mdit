import { create } from 'zustand'

type FileExplorerSelectionStore = {
  selectedEntryPaths: Set<string>
  selectionAnchorPath: string | null
  setSelectedEntryPaths: (paths: Set<string>) => void
  setSelectionAnchorPath: (path: string | null) => void
  resetSelection: () => void
}

export const useFileExplorerSelectionStore = create<FileExplorerSelectionStore>(
  (set) => ({
    selectedEntryPaths: new Set(),
    selectionAnchorPath: null,
    setSelectedEntryPaths: (paths) => set({ selectedEntryPaths: paths }),
    setSelectionAnchorPath: (path) => set({ selectionAnchorPath: path }),
    resetSelection: () =>
      set({
        selectedEntryPaths: new Set(),
        selectionAnchorPath: null,
      }),
  })
)
