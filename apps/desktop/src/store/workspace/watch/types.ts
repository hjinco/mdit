export type VaultWatchBatch = {
	seq: number
	changes: VaultWatchChange[]
	rescan: boolean
	emittedAtUnixMs: number
}

export type VaultWatchChange =
	| {
			type: "created" | "modified" | "deleted"
			relPath: string
			entryKind: "file" | "directory"
	  }
	| {
			type: "moved"
			fromRel: string
			toRel: string
			entryKind: "file" | "directory"
	  }

export type VaultWatchBatchPayload = {
	workspacePath: string
	batch: VaultWatchBatch
}

export type EnqueueBatchRefresh = (
	batch: VaultWatchBatch,
	refresh: () => Promise<void>,
) => void

export type CleanupWatchSessionOptions = {
	workspacePath: string
	stopWatcher: boolean
	stopWarningMessage: string
	unlistenWarningMessage: string
}

export const VAULT_WATCH_BATCH_EVENT = "vault-watch-batch"
