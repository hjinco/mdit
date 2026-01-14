import { create } from 'zustand'
import type { CollectionSlice } from './collection/collection-slice'
import { createCollectionSlice } from './collection/collection-slice'
import { createTabSlice, type TabSlice } from './tab/tab-slice'
import {
  createWorkspaceFileSelectionSlice,
  type WorkspaceFileSelectionSlice,
} from './workspace/workspace-file-selection-slice'
import {
  createWorkspaceFsSlice,
  type WorkspaceFsSlice,
} from './workspace/workspace-fs-slice'
import {
  createWorkspaceSlice,
  type WorkspaceSlice,
} from './workspace/workspace-slice'
import {
  createWorkspaceWatchSlice,
  type WorkspaceWatchSlice,
} from './workspace/workspace-watch-slice'

export const useStore = create<
  WorkspaceSlice &
    TabSlice &
    CollectionSlice &
    WorkspaceFsSlice &
    WorkspaceFileSelectionSlice &
    WorkspaceWatchSlice
>()((...a) => ({
  ...createCollectionSlice(...a),
  ...createTabSlice(...a),
  ...createWorkspaceFsSlice(...a),
  ...createWorkspaceSlice(...a),
  ...createWorkspaceFileSelectionSlice(...a),
  ...createWorkspaceWatchSlice(...a),
}))
