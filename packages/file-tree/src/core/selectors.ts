import type { FileTreeIndex, FileTreeRenderNode, FileTreeState } from "./types"

export function buildRenderTree<T>(
	index: FileTreeIndex<T>,
	state: FileTreeState,
): FileTreeRenderNode<T>[] {
	const buildNode = (id: string): FileTreeRenderNode<T> | null => {
		const node = index.nodesById.get(id)
		if (!node) {
			return null
		}

		const isExpanded =
			node.kind === "directory" && state.expandedIds.has(node.id)
		const children = isExpanded
			? node.childIds
					.map(buildNode)
					.filter((child): child is FileTreeRenderNode<T> => child !== null)
			: undefined

		return {
			id: node.id,
			path: node.path,
			name: node.name,
			depth: node.depth,
			kind: node.kind,
			hasChildren: node.hasChildren,
			isExpanded,
			isSelected: state.selectedIds.has(node.id),
			isRenaming: state.renamingId === node.id,
			isPendingCreateDirectory: state.pendingCreateDirectoryId === node.id,
			isLocked: state.lockedIds.has(node.id),
			isActive: state.activeId === node.id,
			entry: node.entry,
			children: children?.length ? children : undefined,
		}
	}

	return index.rootIds
		.map(buildNode)
		.filter((node): node is FileTreeRenderNode<T> => node !== null)
}

export function getVisibleIds<T>(
	index: FileTreeIndex<T>,
	state: Pick<FileTreeState, "expandedIds">,
) {
	const visibleIds: string[] = []

	const visit = (id: string) => {
		const node = index.nodesById.get(id)
		if (!node) {
			return
		}

		visibleIds.push(node.id)
		if (node.kind !== "directory" || !state.expandedIds.has(node.id)) {
			return
		}

		for (const childId of node.childIds) {
			visit(childId)
		}
	}

	for (const rootId of index.rootIds) {
		visit(rootId)
	}

	return visibleIds
}

export function getRangeIds<T>(
	index: FileTreeIndex<T>,
	state: Pick<FileTreeState, "expandedIds">,
	fromId: string,
	toId: string,
) {
	const visibleIds = getVisibleIds(index, state)
	const fromIndex = visibleIds.indexOf(fromId)
	const toIndex = visibleIds.indexOf(toId)

	if (fromIndex === -1 || toIndex === -1) {
		return []
	}

	const start = Math.min(fromIndex, toIndex)
	const end = Math.max(fromIndex, toIndex)
	return visibleIds.slice(start, end + 1)
}
