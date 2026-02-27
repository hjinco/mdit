import { useMemo } from "react"

import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { buildEntryMap } from "../utils/entry-tree"

export function useEntryMap(entries: WorkspaceEntry[]) {
	return useMemo(() => buildEntryMap(entries), [entries])
}
