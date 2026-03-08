export { createFileTreeIndex } from "./core/index-builder"
export { buildRenderTree, getRangeIds, getVisibleIds } from "./core/selectors"
export type {
	FileTreeAdapter,
	FileTreeExpansionChangeMeta,
	FileTreeIndex,
	FileTreeIndexNode,
	FileTreeNodeKind,
	FileTreeRenderNode,
	FileTreeSelectionChangeMeta,
	FileTreeSelectionMode,
	FileTreeSelectionModifiers,
	FileTreeState,
	UseFileTreeOptions,
	UseFileTreeResult,
} from "./core/types"
export { useFileTree } from "./react/use-file-tree"
