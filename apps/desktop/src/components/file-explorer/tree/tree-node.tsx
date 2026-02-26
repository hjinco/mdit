import { DirectoryTreeNode } from "./directory-tree-node"
import { FileTreeNode } from "./file-tree-node"
import type { TreeNodeProps } from "./tree-node.types"

export type { TreeNodeProps } from "./tree-node.types"

export function TreeNode(props: TreeNodeProps) {
	const { entry } = props

	if (entry.isDirectory) {
		const isExpanded = props.expandedDirectories.includes(entry.path)
		const childrenTree = isExpanded
			? entry.children?.map((child) => (
					<TreeNode
						key={child.path}
						entry={child}
						activeTabPath={props.activeTabPath}
						depth={props.depth + 1}
						expandedDirectories={props.expandedDirectories}
						onDirectoryClick={props.onDirectoryClick}
						onEntryPrimaryAction={props.onEntryPrimaryAction}
						onEntryContextMenu={props.onEntryContextMenu}
						selectedEntryPaths={props.selectedEntryPaths}
						renamingEntryPath={props.renamingEntryPath}
						aiRenamingEntryPaths={props.aiRenamingEntryPaths}
						onRenameSubmit={props.onRenameSubmit}
						onRenameCancel={props.onRenameCancel}
						pendingNewFolderPath={props.pendingNewFolderPath}
						onNewFolderSubmit={props.onNewFolderSubmit}
						onNewFolderCancel={props.onNewFolderCancel}
						onCollectionViewOpen={props.onCollectionViewOpen}
					/>
				))
			: undefined

		return <DirectoryTreeNode {...props} childrenTree={childrenTree} />
	}

	return <FileTreeNode {...props} />
}
