import { createFileTreeIndex } from "@mdit/file-tree"
import { useMemo } from "react"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { normalizePathSeparators } from "@/utils/path-utils"
import { workspaceEntryFileTreeAdapter } from "./use-desktop-file-tree"

export function useEntryMap(entries: WorkspaceEntry[]) {
	return useMemo(() => {
		const index = createFileTreeIndex(entries, workspaceEntryFileTreeAdapter)
		const map = new Map<string, WorkspaceEntry>()

		for (const [path, entry] of index.entryById) {
			const normalizedPath = normalizePathSeparators(path)
			map.set(path, entry)
			if (normalizedPath !== path) {
				map.set(normalizedPath, entry)
			}
		}

		return map
	}, [entries])
}
