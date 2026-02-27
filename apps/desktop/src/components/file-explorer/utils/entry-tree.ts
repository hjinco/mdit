import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { normalizePathSeparators } from "@/utils/path-utils"

export function buildEntryMap(entries: WorkspaceEntry[]) {
	const map = new Map<string, WorkspaceEntry>()

	const traverse = (nodes: WorkspaceEntry[]) => {
		for (const node of nodes) {
			const normalizedPath = normalizePathSeparators(node.path)
			map.set(node.path, node)
			if (normalizedPath !== node.path) {
				map.set(normalizedPath, node)
			}
			if (node.children?.length) {
				traverse(node.children)
			}
		}
	}

	traverse(entries)
	return map
}

export function collectVisibleEntryPaths(
	entries: WorkspaceEntry[],
	expandedDirectories: string[],
) {
	const expandedSet = new Set(expandedDirectories)
	const paths: string[] = []

	const traverse = (nodes: WorkspaceEntry[]) => {
		for (const node of nodes) {
			paths.push(node.path)
			if (
				node.isDirectory &&
				expandedSet.has(node.path) &&
				node.children?.length
			) {
				traverse(node.children)
			}
		}
	}

	traverse(entries)
	return paths
}
