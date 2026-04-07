import type { CollectionSlice } from "../collection/collection-slice"
import type { TabSlice } from "../tab/tab-slice"

export type WorkspacePorts = {
	tab: Pick<
		TabSlice,
		| "hydrateFromOpenedFiles"
		| "openTab"
		| "closeTab"
		| "closeAllTabs"
		| "renameTab"
		| "clearActiveTabSyncedName"
		| "refreshTabFromExternalContent"
		| "updateHistoryPath"
		| "removePathsFromHistory"
		| "clearHistory"
		| "getOpenTabSnapshots"
		| "getActiveTabPath"
	>
	collection: Pick<
		CollectionSlice,
		"resetCollectionPath" | "getCurrentCollectionPath"
	>
}

type WorkspacePortSource = TabSlice & CollectionSlice

export const createWorkspacePorts = (
	get: () => WorkspacePortSource,
): WorkspacePorts => ({
	tab: {
		hydrateFromOpenedFiles: (...args) => get().hydrateFromOpenedFiles(...args),
		openTab: (...args) => get().openTab(...args),
		closeTab: (...args) => get().closeTab(...args),
		closeAllTabs: () => get().closeAllTabs(),
		renameTab: (...args) => get().renameTab(...args),
		clearActiveTabSyncedName: () => get().clearActiveTabSyncedName(),
		refreshTabFromExternalContent: (...args) =>
			get().refreshTabFromExternalContent(...args),
		updateHistoryPath: (...args) => get().updateHistoryPath(...args),
		removePathsFromHistory: (...args) => get().removePathsFromHistory(...args),
		clearHistory: (...args) => get().clearHistory(...args),
		getOpenTabSnapshots: () => get().getOpenTabSnapshots(),
		getActiveTabPath: () => get().getActiveTabPath(),
	},
	collection: {
		resetCollectionPath: (...args) => get().resetCollectionPath(...args),
		getCurrentCollectionPath: () => get().getCurrentCollectionPath(),
	},
})
