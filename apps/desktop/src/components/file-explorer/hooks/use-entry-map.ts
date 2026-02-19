import { useMemo } from "react"

import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { normalizePathSeparators } from "@/utils/path-utils"

export function useEntryMap(entries: WorkspaceEntry[]) {
	return useMemo(() => {
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
	}, [entries])
}
