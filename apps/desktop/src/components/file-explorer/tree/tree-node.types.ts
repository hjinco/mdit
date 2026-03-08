import type { FileTreeRenderNode } from "@mdit/file-tree"
import type { ReactNode } from "react"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"

export type TreeNodeProps = {
	node: FileTreeRenderNode<WorkspaceEntry>
	isFileExplorerOpen: boolean
	onDirectoryClick: (path: string) => void
	onEntryPrimaryAction: (
		entry: WorkspaceEntry,
		event: React.MouseEvent<HTMLButtonElement>,
	) => void
	onEntryContextMenu: (entry: WorkspaceEntry) => void | Promise<void>
	onRenameSubmit: (entry: WorkspaceEntry, name: string) => void | Promise<void>
	onRenameCancel: () => void
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
