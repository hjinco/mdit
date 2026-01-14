import { create } from 'zustand'
import {
  type AISettingsSlice,
  createAISettingsSlice,
} from './ai-settings/ai-settings-slice'
import {
  type CollectionSlice,
  createCollectionSlice,
} from './collection/collection-slice'
import { createEditorSlice, type EditorSlice } from './editor/editor-slice'
import {
  createGitSyncSlice,
  type GitSyncSlice,
} from './git-sync/git-sync-slice'
import {
  createImageEditSlice,
  type ImageEditSlice,
} from './image-edit/image-edit-slice'
import {
  createIndexingSlice,
  type IndexingSlice,
} from './indexing/indexing-slice'
import { createLicenseSlice, type LicenseSlice } from './license/license-slice'
import {
  createMDXSettingsSlice,
  type MDXSettingsSlice,
} from './mdx-settings/mdx-settings-slice'
import { createTabSlice, type TabSlice } from './tab/tab-slice'
import { createUISlice, type UISlice } from './ui/ui-slice'
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

export type StoreState = WorkspaceSlice &
  TabSlice &
  CollectionSlice &
  WorkspaceFsSlice &
  WorkspaceFileSelectionSlice &
  WorkspaceWatchSlice &
  AISettingsSlice &
  EditorSlice &
  GitSyncSlice &
  ImageEditSlice &
  IndexingSlice &
  LicenseSlice &
  MDXSettingsSlice &
  UISlice

export const useStore = create<StoreState>()((...a) => ({
  ...createCollectionSlice(...a),
  ...createTabSlice(...a),
  ...createWorkspaceFsSlice(...a),
  ...createWorkspaceSlice(...a),
  ...createWorkspaceFileSelectionSlice(...a),
  ...createWorkspaceWatchSlice(...a),
  ...createAISettingsSlice(...a),
  ...createEditorSlice(...a),
  ...createGitSyncSlice(...a),
  ...createImageEditSlice(...a),
  ...createIndexingSlice(...a),
  ...createLicenseSlice(...a),
  ...createMDXSettingsSlice(...a),
  ...createUISlice(...a),
}))
