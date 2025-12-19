import { create } from 'zustand'

type CollectionStore = {
  currentCollectionPath: string | null
  lastCollectionPath: string | null
  setCurrentCollectionPath: (
    path: string | null | ((prev: string | null) => string | null)
  ) => void
  resetCollectionPath: () => void
  toggleCollectionView: () => void
}

export const useCollectionStore = create<CollectionStore>((set, get) => ({
  currentCollectionPath: null,
  lastCollectionPath: null,

  setCurrentCollectionPath: (path) => {
    set((state) => {
      const nextPath =
        typeof path === 'function' ? path(state.currentCollectionPath) : path
      return {
        currentCollectionPath: nextPath,
        lastCollectionPath:
          nextPath !== null ? nextPath : state.lastCollectionPath,
      }
    })
  },

  resetCollectionPath: () => {
    set({
      currentCollectionPath: null,
      lastCollectionPath: null,
    })
  },

  toggleCollectionView: () => {
    const { currentCollectionPath, lastCollectionPath } = get()
    if (currentCollectionPath !== null) {
      // Close the view
      set({ currentCollectionPath: null })
    } else if (lastCollectionPath !== null) {
      // Restore the last opened path
      set({ currentCollectionPath: lastCollectionPath })
    }
  },
}))
