import type { LocalMutationJournal } from "@mdit/local-fs-origin"
import type {
	DocumentWorkspaceDependencies,
	OpenDocument,
	OpenDocumentSnapshot,
} from "../documents/types"
import type { FileSystemRepositoryLike, WorkspaceEntry } from "./types"

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

export type WorkspaceWatchLease = {
	workspacePath: string
	sessionId: string
}

export type VaultWatchBatchPayload = WorkspaceWatchLease & {
	batch: VaultWatchBatch
}

export type WorkspaceWatcher = {
	start: (lease: WorkspaceWatchLease) => Promise<void>
	stop: (lease: WorkspaceWatchLease) => Promise<void>
	subscribe: (
		listener: (payload: VaultWatchBatchPayload) => void,
	) => Promise<() => void>
}

type IsCurrent = () => boolean

export type WorkspaceWatchDependencies = {
	watcher: WorkspaceWatcher
	originJournal: Pick<LocalMutationJournal, "resolve" | "clearWorkspace">
	fileSystem: Pick<
		FileSystemRepositoryLike,
		"exists" | "isExistingDirectory" | "stat"
	>
	readDocument: DocumentWorkspaceDependencies["readDocument"]
	tree: {
		getEntryByPath: (path: string) => WorkspaceEntry | null
		readWorkspaceEntriesFromPath: (path: string) => Promise<WorkspaceEntry[]>
		refreshWorkspaceEntries: (isCurrent: IsCurrent) => Promise<void>
		reconcileDirectoryEntries: (
			paths: string[],
			isCurrent: IsCurrent,
		) => Promise<void>
		entryCreated: (input: {
			parentPath: string
			entry: WorkspaceEntry
		}) => Promise<void>
		entriesDeleted: (input: {
			paths: string[]
			preserveUnsaved: boolean
		}) => Promise<void>
		entryRenamed: (input: {
			oldPath: string
			newPath: string
			isDirectory: boolean
			newName: string
		}) => Promise<void>
		entryMoved: (input: {
			sourcePath: string
			destinationDirPath: string
			newPath: string
			isDirectory: boolean
		}) => Promise<void>
		updateEntryModifiedDate: (
			path: string,
			isCurrent?: IsCurrent,
		) => Promise<void>
	}
	documents: {
		getOpenDocumentSnapshots: () => readonly OpenDocumentSnapshot[]
		getDocumentById: (
			documentId: number,
		) => Pick<OpenDocument, "path" | "diskRevision" | "sessionEpoch"> | null
		refreshTabFromExternalContent: (
			path: string,
			content: string,
			options?: {
				preserveSelection?: boolean
				revision?: string
				isCurrent?: IsCurrent
			},
		) => Promise<void>
		removePathsFromHistory: (
			paths: string[],
			options?: { preserveUnsaved?: boolean },
		) => void
	}
	onError?: (error: unknown) => void
}
