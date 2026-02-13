import type { AISettingsSlice } from "../ai-settings/ai-settings-slice"
import type { CollectionSlice } from "../collection/collection-slice"
import type { GitSyncSlice } from "../git-sync/git-sync-slice"
import type { TabSlice } from "../tab/tab-slice"
import type { WorkspaceDependencies } from "./workspace-dependencies"
import type { WorkspacePorts } from "./workspace-ports"
import type { WorkspaceSlice } from "./workspace-slice"

export type WorkspaceStoreState = WorkspaceSlice &
	TabSlice &
	CollectionSlice &
	GitSyncSlice &
	AISettingsSlice

export type WorkspaceSetState = (
	partial:
		| Partial<WorkspaceStoreState>
		| ((state: WorkspaceStoreState) => Partial<WorkspaceStoreState>),
) => void

export type WorkspaceGetState = () => WorkspaceStoreState

export type WorkspaceActionContext = {
	set: WorkspaceSetState
	get: WorkspaceGetState
	deps: WorkspaceDependencies
	ports: WorkspacePorts
}
