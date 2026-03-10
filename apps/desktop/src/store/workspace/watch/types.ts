export type VaultWatchEntryState = "missing" | "file" | "directory" | "unknown"

export type VaultWatchReason =
	| "bootstrapFailure"
	| "watcherOverflow"
	| "watcherError"
	| "ambiguousRename"
	| "directoryCreate"
	| "directoryMoveIn"
	| "directoryMoveWithin"

export type VaultWatchOp =
	| {
			type: "pathState"
			relPath: string
			before: VaultWatchEntryState
			after: VaultWatchEntryState
	  }
	| {
			type: "move"
			fromRel: string
			toRel: string
			entryKind: "file" | "directory"
	  }
	| {
			type: "scanTree"
			relPrefix: string
			reason: VaultWatchReason
	  }
	| {
			type: "fullRescan"
			reason: VaultWatchReason
	  }

export type VaultWatchBatch = {
	streamId: string
	seqInStream: number
	ops: VaultWatchOp[]
	emittedAtUnixMs: number
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
