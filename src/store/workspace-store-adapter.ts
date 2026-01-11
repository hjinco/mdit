import type { WorkspaceEntry } from './workspace-store'
import { useWorkspaceStore } from './workspace-store'

export type WorkspaceStoreSnapshot = {
  workspacePath: string | null
  entries: WorkspaceEntry[]
  expandedDirectories: string[]
  pinnedDirectories: string[]
}

export type WorkspaceStoreAdapter = {
  getSnapshot: () => WorkspaceStoreSnapshot
  updateEntries: (
    action: (entries: WorkspaceEntry[]) => WorkspaceEntry[]
  ) => void
  applyWorkspaceUpdate: (update: {
    entries?: WorkspaceEntry[]
    expandedDirectories?: string[]
    pinnedDirectories?: string[]
  }) => Promise<void>
  setExpandedDirectories: (
    action: (expandedDirectories: string[]) => string[]
  ) => Promise<void>
  refreshWorkspaceEntries: () => Promise<void>
}

export const workspaceStoreAdapter: WorkspaceStoreAdapter = {
  getSnapshot: () => {
    const { workspacePath, entries, expandedDirectories, pinnedDirectories } =
      useWorkspaceStore.getState()
    return { workspacePath, entries, expandedDirectories, pinnedDirectories }
  },
  updateEntries: (action) => useWorkspaceStore.getState().updateEntries(action),
  applyWorkspaceUpdate: (update) =>
    useWorkspaceStore.getState().applyWorkspaceUpdate(update),
  setExpandedDirectories: (action) =>
    useWorkspaceStore.getState().setExpandedDirectories(action),
  refreshWorkspaceEntries: () =>
    useWorkspaceStore.getState().refreshWorkspaceEntries(),
}
