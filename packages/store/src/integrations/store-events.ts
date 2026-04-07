import type { WorkspaceEntry } from "../workspace/workspace-state"

export type StoreEvent =
	| { type: "workspace/reset"; workspacePath: string | null }
	| { type: "workspace/loaded"; workspacePath: string }
	| {
			type: "workspace/tab-reset-requested"
			workspacePath: string | null
			clearHistoryWhenNoActiveTab: boolean
	  }
	| { type: "workspace/entries-replaced"; workspacePath: string }
	| {
			type: "workspace/opened-files-restore-requested"
			workspacePath: string
			paths: string[]
	  }
	| {
			type: "workspace/tab-content-refresh-requested"
			workspacePath: string
			path: string
			content: string
			preserveSelection: boolean
	  }
	| {
			type: "workspace/tab-paths-removed"
			workspacePath: string
			paths: string[]
	  }
	| {
			type: "workspace/tab-path-renamed"
			workspacePath: string
			oldPath: string
			newPath: string
			clearSyncedName: boolean
	  }
	| {
			type: "workspace/tab-path-moved"
			workspacePath: string
			sourcePath: string
			newPath: string
			refreshContent: boolean
	  }
	| {
			type: "workspace/entry-created"
			workspacePath: string
			parentPath: string
			entry: WorkspaceEntry
			expandParent?: boolean
			expandNewDirectory?: boolean
	  }
	| {
			type: "workspace/note-created"
			workspacePath: string | null
			path: string
	  }
	| {
			type: "workspace/entries-deleted"
			workspacePath: string
			paths: string[]
	  }
	| {
			type: "workspace/entry-renamed"
			workspacePath: string
			oldPath: string
			newPath: string
			isDirectory: boolean
			newName: string
	  }
	| {
			type: "workspace/entry-moved"
			workspacePath: string
			sourcePath: string
			destinationDirPath: string
			newPath: string
			isDirectory: boolean
	  }
	| { type: "git-sync/pulled-changes"; workspacePath: string }

export type StoreEventListener = (event: StoreEvent) => void | Promise<void>

export type StoreEventHub = {
	emit: (event: StoreEvent) => Promise<void>
	subscribe: (listener: StoreEventListener) => () => void
}

export const createStoreEventHub = (): StoreEventHub => {
	const listeners = new Set<StoreEventListener>()

	return {
		emit: async (event) => {
			const pending = Array.from(listeners, (listener) => {
				try {
					return Promise.resolve(listener(event))
				} catch (error) {
					return Promise.reject(error)
				}
			})

			const settled = await Promise.allSettled(pending)
			const rejected = settled.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			)
			if (rejected) {
				throw rejected.reason
			}
		},
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}
