import type { LocalMutationJournal } from "@mdit/local-fs-origin"
import type { StoreApi } from "zustand"
import type { StoreEventHub } from "../integrations/store-events"
import type { WorkspaceDependencies } from "./workspace-dependencies"
import type { WorkspacePorts } from "./workspace-ports"
import type { WorkspaceSlice } from "./workspace-slice"

export type WorkspaceStoreState = WorkspaceSlice

export type WorkspaceSetState<
	TStoreState extends WorkspaceStoreState = WorkspaceStoreState,
> = StoreApi<TStoreState>["setState"]

export type WorkspaceGetState<
	TStoreState extends WorkspaceStoreState = WorkspaceStoreState,
> = StoreApi<TStoreState>["getState"]

export type WorkspaceRuntime = {
	originJournal: LocalMutationJournal
	events: StoreEventHub
}

export type WorkspaceActionContext<
	TStoreState extends WorkspaceStoreState = WorkspaceStoreState,
> = {
	set: WorkspaceSetState<TStoreState>
	get: WorkspaceGetState<TStoreState>
	deps: WorkspaceDependencies
	ports: WorkspacePorts
	runtime: WorkspaceRuntime
}
