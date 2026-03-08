import type { FileTreeAdapter, FileTreeIndex, FileTreeIndexNode } from "./types"

export function createFileTreeIndex<T>(
	entries: T[],
	adapter: FileTreeAdapter<T>,
): FileTreeIndex<T> {
	const rootIds: string[] = []
	const nodesById = new Map<string, FileTreeIndexNode<T>>()
	const entryById = new Map<string, T>()

	const visit = (entry: T, parentId: string | null, depth: number) => {
		const id = adapter.getId(entry)
		const children = adapter.getChildren(entry) ?? []
		const childIds = children.map((child) => adapter.getId(child))
		const node: FileTreeIndexNode<T> = {
			id,
			path: adapter.getPath(entry),
			name: adapter.getName(entry),
			entry,
			parentId,
			childIds,
			kind: adapter.isDirectory(entry) ? "directory" : "file",
			depth,
			hasChildren: childIds.length > 0,
		}

		nodesById.set(id, node)
		entryById.set(id, entry)
		if (parentId === null) {
			rootIds.push(id)
		}

		for (const child of children) {
			visit(child, id, depth + 1)
		}
	}

	for (const entry of entries) {
		visit(entry, null, 0)
	}

	return {
		rootIds,
		nodesById,
		entryById,
	}
}
