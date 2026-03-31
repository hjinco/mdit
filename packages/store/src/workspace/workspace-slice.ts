import {
	createLocalMutationJournal,
	DEFAULT_LOCAL_MUTATION_TTL_MS,
} from "@mdit/local-fs-origin"
import type { StateCreator } from "zustand"
import type { CollectionSlice } from "../collection/collection-slice"
import type { IndexingSlice } from "../indexing/indexing-slice"
import type { TabSlice } from "../tab/tab-slice"
import {
	createDirectoryUiActions,
	type WorkspaceDirectoryUiActions,
} from "./directory-ui"
import {
	createEntrySessionActions,
	type WorkspaceEntrySessionActions,
} from "./entry-session"
import { createFsActions, type WorkspaceFsActions } from "./fs"
import {
	createLifecycleActions,
	type WorkspaceLifecycleActions,
} from "./lifecycle"
import { createTreeActions, type WorkspaceTreeActions } from "./tree"
import { createWatchActions, type WorkspaceWatchActions } from "./watch"
import type { WorkspaceActionContext } from "./workspace-action-context"
import type { WorkspaceDependencies } from "./workspace-dependencies"
import { createWorkspacePorts } from "./workspace-ports"
import type { WorkspaceState } from "./workspace-state"
import { buildWorkspaceState } from "./workspace-state"

export type { WorkspaceEntry, WorkspaceEntrySelection } from "./workspace-state"

export type WorkspaceActions = WorkspaceTreeActions &
	WorkspaceDirectoryUiActions &
	WorkspaceLifecycleActions &
	WorkspaceFsActions &
	WorkspaceEntrySessionActions &
	WorkspaceWatchActions

export type WorkspaceSlice = WorkspaceState & WorkspaceActions

type WorkspaceSliceStoreState = WorkspaceSlice &
	TabSlice &
	CollectionSlice &
	IndexingSlice

export const prepareWorkspaceSlice =
	(
		dependencies: WorkspaceDependencies,
	): StateCreator<WorkspaceSliceStoreState, [], [], WorkspaceSlice> =>
	(set, get) => {
		const originJournal = createLocalMutationJournal({
			defaultTtlMs: DEFAULT_LOCAL_MUTATION_TTL_MS,
		})
		const actionContext: WorkspaceActionContext<WorkspaceSliceStoreState> = {
			set,
			get,
			deps: dependencies,
			ports: createWorkspacePorts(get),
			runtime: {
				originJournal,
			},
		}

		return {
			...buildWorkspaceState({ isLoading: true }),
			...createTreeActions(actionContext),
			...createDirectoryUiActions(actionContext),
			...createLifecycleActions(actionContext),
			...createFsActions(actionContext),
			...createEntrySessionActions(actionContext),
			...createWatchActions(actionContext),
		}
	}
