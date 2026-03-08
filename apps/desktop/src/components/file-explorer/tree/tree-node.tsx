import { DirectoryTreeNode } from "./directory-tree-node"
import { FileTreeNode } from "./file-tree-node"
import type { TreeNodeProps } from "./tree-node.types"

export type { TreeNodeProps } from "./tree-node.types"

export function TreeNode(props: TreeNodeProps) {
	const { node } = props

	if (node.kind === "directory") {
		const childrenTree = node.children?.map((child) => (
			<TreeNode
				key={child.path}
				node={child}
				isFileExplorerOpen={props.isFileExplorerOpen}
				onDirectoryClick={props.onDirectoryClick}
				onEntryPrimaryAction={props.onEntryPrimaryAction}
				onEntryContextMenu={props.onEntryContextMenu}
				onRenameSubmit={props.onRenameSubmit}
				onRenameCancel={props.onRenameCancel}
				onNewFolderSubmit={props.onNewFolderSubmit}
				onNewFolderCancel={props.onNewFolderCancel}
				onCollectionViewOpen={props.onCollectionViewOpen}
			/>
		))

		return <DirectoryTreeNode {...props} childrenTree={childrenTree} />
	}

	return <FileTreeNode {...props} />
}
