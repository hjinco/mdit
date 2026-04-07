import type { WorkspaceEntry } from "@/store"

export type UseFileExplorerMenusProps = {
	canRenameNoteWithAI: boolean
	renameNotesWithAI: (entries: WorkspaceEntry[]) => Promise<void>
	canMoveNotesWithAI: boolean
	moveNotesWithAI: (entries: WorkspaceEntry[]) => Promise<void>
	beginRenaming: (entry: WorkspaceEntry) => void
	beginNewFolder: (directoryPath: string) => void
	handleDeleteEntries: (paths: string[]) => Promise<void>
	hasLockedPathConflict: (paths: string[]) => boolean
	createNote: (
		directoryPath: string,
		options?: {
			initialName?: string
			initialContent?: string
			openTab?: boolean
		},
	) => Promise<string>
	workspacePath: string | null
	selectedEntryPaths: Set<string>
	selectionAnchorPath: string | null
	setEntrySelection: (selection: {
		selectedIds: Set<string>
		anchorId: string | null
	}) => void
	resetSelection: () => void
	lookupEntryByPath: (path: string) => WorkspaceEntry | undefined
	entries: WorkspaceEntry[]
	pinnedDirectories: string[]
	pinDirectory: (path: string) => Promise<void>
	unpinDirectory: (path: string) => Promise<void>
}
