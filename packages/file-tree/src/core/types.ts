export type FileTreeNodeKind = "file" | "directory"

export type FileTreeAdapter<T> = {
	getId: (entry: T) => string
	getPath: (entry: T) => string
	getName: (entry: T) => string
	getChildren: (entry: T) => T[] | undefined
	isDirectory: (entry: T) => boolean
}

export type FileTreeState = {
	expandedIds: ReadonlySet<string>
	selectedIds: ReadonlySet<string>
	anchorId: string | null
	renamingId: string | null
	pendingCreateDirectoryId: string | null
	lockedIds: ReadonlySet<string>
	activeId: string | null
}

export type FileTreeSelectionModifiers = {
	shiftKey?: boolean
	metaKey?: boolean
	ctrlKey?: boolean
	altKey?: boolean
}

export type FileTreeSelectionMode = "single" | "toggle" | "range"

export type FileTreeSelectionChangeMeta = {
	targetId: string
	mode: FileTreeSelectionMode
}

export type FileTreeExpansionChangeMeta = {
	targetId: string
	action: "expand" | "collapse" | "toggle"
}

export type FileTreeIndexNode<T> = {
	id: string
	path: string
	name: string
	entry: T
	parentId: string | null
	childIds: string[]
	kind: FileTreeNodeKind
	depth: number
	hasChildren: boolean
}

export type FileTreeIndex<T> = {
	rootIds: string[]
	nodesById: ReadonlyMap<string, FileTreeIndexNode<T>>
	entryById: ReadonlyMap<string, T>
}

export type FileTreeRenderNode<T> = {
	id: string
	path: string
	name: string
	depth: number
	kind: FileTreeNodeKind
	hasChildren: boolean
	isExpanded: boolean
	isSelected: boolean
	isRenaming: boolean
	isPendingCreateDirectory: boolean
	isLocked: boolean
	isActive: boolean
	entry: T
	children?: FileTreeRenderNode<T>[]
}

export type UseFileTreeOptions<T> = {
	entries: T[]
	adapter: FileTreeAdapter<T>
	state: FileTreeState
	onExpandedIdsChange?: (
		nextExpandedIds: Set<string>,
		meta: FileTreeExpansionChangeMeta,
	) => void | Promise<void>
	onSelectionChange?: (
		nextSelectedIds: Set<string>,
		nextAnchorId: string | null,
		meta: FileTreeSelectionChangeMeta,
	) => void | Promise<void>
}

export type UseFileTreeResult<T> = {
	tree: FileTreeRenderNode<T>[]
	visibleIds: string[]
	nodeById: ReadonlyMap<string, T>
	handleItemPress: (id: string, modifiers?: FileTreeSelectionModifiers) => void
	toggleExpanded: (id: string) => void
	expand: (id: string) => void
	collapse: (id: string) => void
	getVisibleIndex: (id: string) => number
	getNextVisibleId: (id: string, direction: "prev" | "next") => string | null
	getRangeIds: (fromId: string, toId: string) => string[]
}
