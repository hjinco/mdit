import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { normalizePathSeparators } from "@/utils/path-utils"

export function buildEntryMap(entries: WorkspaceEntry[]) {
	const map = new Map<string, WorkspaceEntry>()

	const stack: WorkspaceEntry[] = [...entries].reverse()

	while (stack.length) {
		const node = stack.pop()
		if (!node) {
			continue
		}
		const normalizedPath = normalizePathSeparators(node.path)
		map.set(node.path, node)
		if (normalizedPath !== node.path) {
			map.set(normalizedPath, node)
		}
		if (node.children?.length) {
			for (let i = node.children.length - 1; i >= 0; i--) {
				stack.push(node.children[i]!)
			}
		}
	}

	return map
}

export function collectVisibleEntryPaths(
	entries: WorkspaceEntry[],
	expandedDirectories: string[],
) {
	const expandedSet = new Set(expandedDirectories)
	const paths: string[] = []

	const stack: WorkspaceEntry[] = [...entries].reverse()

	while (stack.length) {
		const node = stack.pop()
		if (!node) {
			continue
		}
		paths.push(node.path)
		if (
			node.isDirectory &&
			expandedSet.has(node.path) &&
			node.children?.length
		) {
			for (let i = node.children.length - 1; i >= 0; i--) {
				stack.push(node.children[i]!)
			}
		}
	}
	return paths
}
