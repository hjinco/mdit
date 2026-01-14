import type { StateCreator } from 'zustand'
import type {
  WorkspaceEntry,
  WorkspaceSlice,
} from '../workspace/workspace-slice'
import { computeCollectionEntries } from './helpers/collection-entries'

export type CollectionSlice = {
  currentCollectionPath: string | null
  lastCollectionPath: string | null
  collectionEntries: WorkspaceEntry[]
  setCurrentCollectionPath: (
    path: string | null | ((prev: string | null) => string | null)
  ) => void
  clearLastCollectionPath: () => void
  resetCollectionPath: () => void
  toggleCollectionView: () => void
  refreshCollectionEntries: () => void
}

export const prepareCollectionSlice =
  (): StateCreator<CollectionSlice & WorkspaceSlice, [], [], CollectionSlice> =>
  (set, get) => ({
    currentCollectionPath: null,
    lastCollectionPath: null,
    collectionEntries: [],

    setCurrentCollectionPath: (path) => {
      set((state) => {
        const nextPath =
          typeof path === 'function' ? path(state.currentCollectionPath) : path
        return {
          currentCollectionPath: nextPath,
          lastCollectionPath:
            nextPath !== null ? nextPath : state.lastCollectionPath,
          collectionEntries: computeCollectionEntries(nextPath, get().entries),
        }
      })
    },

    clearLastCollectionPath: () => {
      set({
        lastCollectionPath: null,
      })
    },

    resetCollectionPath: () => {
      set({
        currentCollectionPath: null,
        lastCollectionPath: null,
        collectionEntries: [],
      })
    },

    toggleCollectionView: () => {
      const { currentCollectionPath, lastCollectionPath } = get()
      if (currentCollectionPath !== null) {
        // Close the view
        set({ currentCollectionPath: null, collectionEntries: [] })
      } else if (lastCollectionPath !== null) {
        // Restore the last opened path
        set({
          currentCollectionPath: lastCollectionPath,
          collectionEntries: computeCollectionEntries(
            lastCollectionPath,
            get().entries
          ),
        })
      }
    },

    refreshCollectionEntries: () => {
      set((state) => ({
        collectionEntries: computeCollectionEntries(
          state.currentCollectionPath,
          get().entries
        ),
      }))
    },
  })

export const createCollectionSlice = prepareCollectionSlice()
