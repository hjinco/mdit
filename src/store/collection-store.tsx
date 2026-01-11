import { create } from 'zustand'
import { computeCollectionEntries } from './collection/helpers/collection-entries'
import type { WorkspaceEntry } from './workspace-store'
import { useWorkspaceStore } from './workspace-store'
import {
  type WorkspaceStoreAdapter,
  workspaceStoreAdapter,
} from './workspace-store-adapter'

type CollectionStore = {
  currentCollectionPath: string | null
  lastCollectionPath: string | null
  collectionEntries: WorkspaceEntry[]
  setCurrentCollectionPath: (
    path: string | null | ((prev: string | null) => string | null)
  ) => void
  resetCollectionPath: () => void
  toggleCollectionView: () => void
  refreshCollectionEntries: () => void
}

export const createCollectionStore = ({
  workspaceStoreAdapter,
}: {
  workspaceStoreAdapter: WorkspaceStoreAdapter
}) =>
  create<CollectionStore>((set, get) => ({
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
          collectionEntries: computeCollectionEntries(
            nextPath,
            workspaceStoreAdapter.getSnapshot().entries
          ),
        }
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
            workspaceStoreAdapter.getSnapshot().entries
          ),
        })
      }
    },

    refreshCollectionEntries: () => {
      set((state) => ({
        collectionEntries: computeCollectionEntries(
          state.currentCollectionPath,
          workspaceStoreAdapter.getSnapshot().entries
        ),
      }))
    },
  }))

export const useCollectionStore = createCollectionStore({
  workspaceStoreAdapter,
})

let workspacePathUnsub: (() => void) | null = null

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    workspacePathUnsub?.()
    workspacePathUnsub = null
  })
}

// Subscribe to workspacePath changes and update collection entries.
if (!workspacePathUnsub) {
  workspacePathUnsub = useWorkspaceStore.subscribe((state, prevState) => {
    const collectionState = useCollectionStore.getState()
    if (state.workspacePath !== prevState.workspacePath) {
      collectionState.resetCollectionPath()
    } else if (state.entries !== prevState.entries) {
      collectionState.refreshCollectionEntries()
    }
  })
}
