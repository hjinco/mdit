import type { StateCreator } from 'zustand'

export type WorkspaceFileSelectionSlice = {
  selectedEntryPaths: Set<string>
  selectionAnchorPath: string | null
  setSelectedEntryPaths: (paths: Set<string>) => void
  setSelectionAnchorPath: (path: string | null) => void
  resetSelection: () => void
}

export const prepareWorkspaceFileSelectionSlice =
  (): StateCreator<
    WorkspaceFileSelectionSlice,
    [],
    [],
    WorkspaceFileSelectionSlice
  > =>
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

export const createWorkspaceFileSelectionSlice =
  prepareWorkspaceFileSelectionSlice()
