import type { CollectionSlice } from "../collection/collection-slice"
import type { GitSyncSlice } from "../git-sync/git-sync-slice"
import type { IndexingSlice } from "../indexing/indexing-slice"
import type { TabSlice } from "../tab/tab-slice"

export type WorkspacePorts = {
	tab: Pick<
		TabSlice,
		| "hydrateFromOpenedFiles"
		| "openTab"
		| "closeTab"
		| "renameTab"
		| "refreshTabFromExternalContent"
		| "updateHistoryPath"
		| "removePathsFromHistory"
		| "clearHistory"
		| "getActiveTabPath"
		| "getIsSaved"
	>
	collection: Pick<
		CollectionSlice,
		| "refreshCollectionEntries"
		| "onEntryCreated"
		| "onEntriesDeleted"
		| "onEntryRenamed"
		| "onEntryMoved"
		| "resetCollectionPath"
		| "getCurrentCollectionPath"
	>
	gitSync: Pick<GitSyncSlice, "initGitSync">
	indexing: Pick<IndexingSlice, "resetIndexingState" | "getIndexingConfig">
}

type WorkspacePortSource = TabSlice &
	CollectionSlice &
	GitSyncSlice &
	IndexingSlice

export const createWorkspacePorts = (
	get: () => WorkspacePortSource,
): WorkspacePorts => ({
	tab: {
		hydrateFromOpenedFiles: (...args) => get().hydrateFromOpenedFiles(...args),
		openTab: (...args) => get().openTab(...args),
		closeTab: (...args) => get().closeTab(...args),
		renameTab: (...args) => get().renameTab(...args),
		refreshTabFromExternalContent: (...args) =>
			get().refreshTabFromExternalContent(...args),
		updateHistoryPath: (...args) => get().updateHistoryPath(...args),
		removePathsFromHistory: (...args) => get().removePathsFromHistory(...args),
		clearHistory: (...args) => get().clearHistory(...args),
		getActiveTabPath: () => get().getActiveTabPath(),
		getIsSaved: () => get().getIsSaved(),
	},
	collection: {
		refreshCollectionEntries: (...args) =>
			get().refreshCollectionEntries(...args),
		onEntryCreated: (...args) => get().onEntryCreated(...args),
		onEntriesDeleted: (...args) => get().onEntriesDeleted(...args),
		onEntryRenamed: (...args) => get().onEntryRenamed(...args),
		onEntryMoved: (...args) => get().onEntryMoved(...args),
		resetCollectionPath: (...args) => get().resetCollectionPath(...args),
		getCurrentCollectionPath: () => get().getCurrentCollectionPath(),
	},
	gitSync: {
		initGitSync: (...args) => get().initGitSync(...args),
	},
	indexing: {
		resetIndexingState: () => get().resetIndexingState(),
		getIndexingConfig: (...args) => get().getIndexingConfig(...args),
	},
})
