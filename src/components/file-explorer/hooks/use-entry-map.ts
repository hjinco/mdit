import { useMemo } from 'react'

import type { WorkspaceEntry } from '@/store/workspace-store'

export function useEntryMap(entries: WorkspaceEntry[]) {
  return useMemo(() => {
    const map = new Map<string, WorkspaceEntry>()

    const traverse = (nodes: WorkspaceEntry[]) => {
      for (const node of nodes) {
        map.set(node.path, node)
        if (node.children?.length) {
          traverse(node.children)
        }
      }
    }

    traverse(entries)
    return map
  }, [entries])
}

