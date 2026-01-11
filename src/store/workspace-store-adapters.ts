import type { ChatConfig } from './ai-settings-store'
import { useAISettingsStore } from './ai-settings-store'
import { useCollectionStore } from './collection-store'
import { useFileExplorerSelectionStore } from './file-explorer-selection-store'
import { useTabStore } from './tab-store'

export type TabStoreSnapshot = {
  tab: { path: string } | null
  isSaved: boolean
}

export type TabStoreAdapter = {
  getSnapshot: () => TabStoreSnapshot
  openTab: (path: string) => Promise<void>
  closeTab: (path: string) => void
  clearHistory: () => void
  renameTab: (
    oldPath: string,
    newPath: string,
    options?: { refreshContent?: boolean; renameOnFs?: boolean }
  ) => Promise<void>
  updateHistoryPath: (oldPath: string, newPath: string) => void
  removePathFromHistory: (path: string) => void
}

export type CollectionStoreSnapshot = {
  currentCollectionPath: string | null
  lastCollectionPath: string | null
}

export type CollectionStoreAdapter = {
  getSnapshot: () => CollectionStoreSnapshot
  resetCollectionPath: () => void
  setCurrentCollectionPath: (path: string | null) => void
  clearLastCollectionPath: () => void
}

export type FileExplorerSelectionAdapter = {
  setSelectedEntryPaths: (paths: Set<string>) => void
  setSelectionAnchorPath: (path: string | null) => void
}

export type AISettingsAdapter = {
  getRenameConfig: () => ChatConfig | null
}

export const tabStoreAdapter: TabStoreAdapter = {
  getSnapshot: () => {
    const { tab, isSaved } = useTabStore.getState()
    return { tab: tab ? { path: tab.path } : null, isSaved }
  },
  openTab: (path) => useTabStore.getState().openTab(path),
  closeTab: (path) => useTabStore.getState().closeTab(path),
  clearHistory: () => useTabStore.getState().clearHistory(),
  renameTab: (oldPath, newPath, options) =>
    useTabStore.getState().renameTab(oldPath, newPath, options),
  updateHistoryPath: (oldPath, newPath) =>
    useTabStore.getState().updateHistoryPath(oldPath, newPath),
  removePathFromHistory: (path) =>
    useTabStore.getState().removePathFromHistory(path),
}

export const collectionStoreAdapter: CollectionStoreAdapter = {
  getSnapshot: () => {
    const { currentCollectionPath, lastCollectionPath } =
      useCollectionStore.getState()
    return { currentCollectionPath, lastCollectionPath }
  },
  resetCollectionPath: () =>
    useCollectionStore.getState().resetCollectionPath(),
  setCurrentCollectionPath: (path) =>
    useCollectionStore.getState().setCurrentCollectionPath(path),
  clearLastCollectionPath: () =>
    useCollectionStore.setState({ lastCollectionPath: null }),
}

export const fileExplorerSelectionAdapter: FileExplorerSelectionAdapter = {
  setSelectedEntryPaths: (paths) =>
    useFileExplorerSelectionStore.getState().setSelectedEntryPaths(paths),
  setSelectionAnchorPath: (path) =>
    useFileExplorerSelectionStore.getState().setSelectionAnchorPath(path),
}

export const aiSettingsAdapter: AISettingsAdapter = {
  getRenameConfig: () => useAISettingsStore.getState().renameConfig,
}
