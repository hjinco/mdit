import { useMemo, useState } from 'react'
import type { WorkspaceEntry } from '@/store/workspace-store'

export type SortOption = 'name' | 'createdAt' | 'modifiedAt'
export type SortDirection = 'asc' | 'desc'

export function useCollectionSort(entries: WorkspaceEntry[]) {
  const [sortOption, setSortOption] = useState<SortOption>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const sortedEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      let comparison = 0

      switch (sortOption) {
        case 'name':
          comparison = a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: 'base',
          })
          break

        case 'createdAt':
          // Fallback to name if createdAt is not available
          if (!a.createdAt && !b.createdAt) {
            comparison = a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          } else if (!a.createdAt) {
            comparison = 1 // Items without createdAt go to the end
          } else if (b.createdAt) {
            comparison = a.createdAt.getTime() - b.createdAt.getTime()
          } else {
            comparison = -1
          }
          break

        case 'modifiedAt':
          // Fallback to name if modifiedAt is not available
          if (!a.modifiedAt && !b.modifiedAt) {
            comparison = a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          } else if (!a.modifiedAt) {
            comparison = 1 // Items without modifiedAt go to the end
          } else if (b.modifiedAt) {
            comparison = a.modifiedAt.getTime() - b.modifiedAt.getTime()
          } else {
            comparison = -1
          }
          break

        default:
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [entries, sortOption, sortDirection])

  return {
    sortedEntries,
    sortOption,
    sortDirection,
    setSortOption,
    setSortDirection,
  }
}
