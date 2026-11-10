export type TabHistoryPoint = {
	path: number[]
	offset: number
}

export type TabHistorySelection = {
	anchor: TabHistoryPoint
	focus: TabHistoryPoint
} | null

export type TabHistoryEntry = {
	path: string
	selection: TabHistorySelection
}

export type Tab = {
	id: number
	documentId: number
	history: TabHistoryEntry[]
	historyIndex: number
}

export type DiskDocument = {
	content: string
	revision: string
}

export type DocumentConflict =
	| { type: "changed"; content: string }
	| { type: "deleted" }

export type OpenDocument = {
	id: number
	path: string
	name: string
	content: string
	diskRevision: string
	sessionEpoch: number
	isSaved: boolean
	conflict?: DocumentConflict
}

export type ResolvedTab = Tab &
	Pick<OpenDocument, "content" | "isSaved" | "name" | "path" | "sessionEpoch">

export type PendingHistorySelectionRestoreResult =
	| { found: false }
	| { found: true; selection: TabHistorySelection }

export type OpenDocumentSnapshot = {
	documentId: number
	path: string
	isSaved: boolean
}

export type DocumentDraft = Readonly<{ content: string; title: string }>
export type DocumentSnapshotProvider = () => DocumentDraft | null

export type DocumentWriteInput = {
	path: string
	expectedRevision: string
	content: string
}

export type DocumentRenameInput = {
	oldPath: string
	newPath: string
	expectedRevision: string
}

type DocumentMutationConflict =
	| { status: "changed"; document: DiskDocument }
	| { status: "deleted" }

export type DocumentWriteResult =
	| { status: "saved"; revision: string }
	| DocumentMutationConflict

export type DocumentRenameResult =
	| { status: "renamed"; revision: string }
	| DocumentMutationConflict

export type DocumentWorkspaceDependencies = {
	readDocument: (path: string) => Promise<DiskDocument | null>
	writeDocument: (input: DocumentWriteInput) => Promise<DocumentWriteResult>
	renameDocument: (input: DocumentRenameInput) => Promise<DocumentRenameResult>
	isRenameBlocked?: (oldPath: string, newPath: string) => boolean
	onSaved?: (path: string) => void
	onRenamed?: (oldPath: string, newPath: string) => void | Promise<void>
	reportSaveError: (error: unknown) => void
	getWorkspacePath: () => string | null
	saveLastOpenedFiles: (
		workspacePath: string,
		relativePaths: string[],
	) => Promise<void>
}

export type DocumentsSnapshot = {
	tabs: Tab[]
	openDocuments: OpenDocument[]
	activeTabId: number | null
}
