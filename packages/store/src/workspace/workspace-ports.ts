import type { CollectionSlice } from "../collection/collection-slice"
import type { TabSlice } from "../tab/tab-slice"

export type WorkspacePorts = {
	tab: Pick<TabSlice, "getOpenTabSnapshots" | "getActiveTabPath">
	collection: Pick<CollectionSlice, "getCurrentCollectionPath">
}

type WorkspacePortSource = TabSlice & CollectionSlice

export const createWorkspacePorts = (
	get: () => WorkspacePortSource,
): WorkspacePorts => ({
	tab: {
		getOpenTabSnapshots: () => get().getOpenTabSnapshots(),
		getActiveTabPath: () => get().getActiveTabPath(),
	},
	collection: {
		getCurrentCollectionPath: () => get().getCurrentCollectionPath(),
	},
})
