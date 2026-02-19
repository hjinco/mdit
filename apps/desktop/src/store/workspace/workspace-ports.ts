import type { CollectionSlice } from "../collection/collection-slice"
import type { GitSyncSlice } from "../git-sync/git-sync-slice"
import type { TabSlice } from "../tab/tab-slice"

export type WorkspacePorts = {
	tab: Pick<
		TabSlice,
		| "openTab"
		| "closeTab"
		| "renameTab"
		| "updateHistoryPath"
		| "removePathFromHistory"
		| "clearHistory"
	>
	collection: Pick<
		CollectionSlice,
		| "refreshCollectionEntries"
		| "onEntryCreated"
		| "onEntriesDeleted"
		| "onEntryRenamed"
		| "onEntryMoved"
		| "resetCollectionPath"
	>
	gitSync: Pick<GitSyncSlice, "initGitSync">
}

type WorkspacePortSource = TabSlice & CollectionSlice & GitSyncSlice

export const createWorkspacePorts = (
	get: () => WorkspacePortSource,
): WorkspacePorts => ({
	tab: {
		openTab: (...args) => get().openTab(...args),
		closeTab: (...args) => get().closeTab(...args),
		renameTab: (...args) => get().renameTab(...args),
		updateHistoryPath: (...args) => get().updateHistoryPath(...args),
		removePathFromHistory: (...args) => get().removePathFromHistory(...args),
		clearHistory: (...args) => get().clearHistory(...args),
	},
	collection: {
		refreshCollectionEntries: (...args) =>
			get().refreshCollectionEntries(...args),
		onEntryCreated: (...args) => get().onEntryCreated(...args),
		onEntriesDeleted: (...args) => get().onEntriesDeleted(...args),
		onEntryRenamed: (...args) => get().onEntryRenamed(...args),
		onEntryMoved: (...args) => get().onEntryMoved(...args),
		resetCollectionPath: (...args) => get().resetCollectionPath(...args),
	},
	gitSync: {
		initGitSync: (...args) => get().initGitSync(...args),
	},
})
