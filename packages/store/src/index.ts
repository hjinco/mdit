import { create, type StoreApi, type UseBoundStore } from "zustand"
import {
	type AISettingsSlice,
	type AISettingsSliceDependencies,
	prepareAISettingsSlice,
} from "./ai-settings/ai-settings-slice"
import type { EditorSlice } from "./editor/editor-slice"
import { prepareEditorSlice } from "./editor/editor-slice"
import type { GitSyncSlice } from "./git-sync/git-sync-slice"
import {
	type GitSyncSliceDependencies,
	prepareGitSyncSlice,
} from "./git-sync/git-sync-slice"
import type { HotkeysSlice } from "./hotkeys/hotkeys-slice"
import {
	type HotkeysSliceDependencies,
	prepareHotkeysSlice,
} from "./hotkeys/hotkeys-slice"
import type { ImageEditSlice } from "./image-edit/image-edit-slice"
import { prepareImageEditSlice } from "./image-edit/image-edit-slice"
import type { IndexingSlice } from "./indexing/indexing-slice"
import {
	type IndexingSliceDependencies,
	prepareIndexingSlice,
} from "./indexing/indexing-slice"
import type { TabSlice } from "./tab/tab-slice"
import { prepareTabSlice, type TabSliceDependencies } from "./tab/tab-slice"
import type { UISlice } from "./ui/ui-slice"
import { prepareUISlice, type UISliceDependencies } from "./ui/ui-slice"
import type { WorkspaceDependencies } from "./workspace/workspace-dependencies"
import type { WorkspaceSlice } from "./workspace/workspace-slice"
import { prepareWorkspaceSlice } from "./workspace/workspace-slice"

export type StoreState = WorkspaceSlice &
	TabSlice &
	AISettingsSlice &
	EditorSlice &
	GitSyncSlice &
	ImageEditSlice &
	IndexingSlice &
	HotkeysSlice &
	UISlice

export type MditStoreDependencies = {
	aiSettings: AISettingsSliceDependencies
	gitSync: GitSyncSliceDependencies
	hotkeys: HotkeysSliceDependencies
	indexing: IndexingSliceDependencies
	tab: TabSliceDependencies
	ui: UISliceDependencies
	workspace: WorkspaceDependencies
}

export type MditStore = UseBoundStore<StoreApi<StoreState>>

export const createMditStore = (
	dependencies: MditStoreDependencies,
): MditStore => {
	const createEditorSlice = prepareEditorSlice()
	const createImageEditSlice = prepareImageEditSlice()
	const createAISettingsSlice = prepareAISettingsSlice(dependencies.aiSettings)
	const createGitSyncSlice = prepareGitSyncSlice(dependencies.gitSync)
	const createHotkeysSlice = prepareHotkeysSlice(dependencies.hotkeys)
	const createIndexingSlice = prepareIndexingSlice(dependencies.indexing)
	const createTabSlice = prepareTabSlice(dependencies.tab)
	const createUISlice = prepareUISlice(dependencies.ui)
	const createWorkspaceSlice = prepareWorkspaceSlice(dependencies.workspace)

	return create<StoreState>()((...args) => ({
		...createTabSlice(...args),
		...createWorkspaceSlice(...args),
		...createAISettingsSlice(...args),
		...createEditorSlice(...args),
		...createGitSyncSlice(...args),
		...createImageEditSlice(...args),
		...createIndexingSlice(...args),
		...createHotkeysSlice(...args),
		...createUISlice(...args),
	}))
}
