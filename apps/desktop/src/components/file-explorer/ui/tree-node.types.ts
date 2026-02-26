import type { ReactNode } from "react"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"

export type TreeNodeProps = {
	entry: WorkspaceEntry
	activeTabPath: string | null
	depth: number
	expandedDirectories: string[]
	onDirectoryClick: (path: string) => void
	onEntryPrimaryAction: (
		entry: WorkspaceEntry,
		event: React.MouseEvent<HTMLButtonElement>,
	) => void
	onEntryContextMenu: (entry: WorkspaceEntry) => void | Promise<void>
	selectedEntryPaths: Set<string>
	renamingEntryPath: string | null
	aiRenamingEntryPaths: Set<string>
	onRenameSubmit: (entry: WorkspaceEntry, name: string) => void | Promise<void>
	onRenameCancel: () => void
	pendingNewFolderPath: string | null
	onNewFolderSubmit: (
		directoryPath: string,
		folderName: string,
	) => void | Promise<void>
	onNewFolderCancel: () => void
	onCollectionViewOpen: (entry: WorkspaceEntry) => void
}

export type DirectoryTreeNodeProps = TreeNodeProps & {
	childrenTree: ReactNode
}
