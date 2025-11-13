import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceEntry } from '@/store/workspace-store'

export type SortOption =
  | 'name'
  | 'createdAt'
  | 'modifiedAt'
  | 'tagRelevance'
export type SortDirection = 'asc' | 'desc'

const COLLECTION_SORT_OPTION_KEY = 'collection-sort-option'
const COLLECTION_SORT_DIRECTION_KEY = 'collection-sort-direction'

const DEFAULT_SORT_OPTION: SortOption = 'name'
const DEFAULT_SORT_DIRECTION: SortDirection = 'asc'

const readInitialSortOption = (): SortOption => {
  const stored = localStorage.getItem(COLLECTION_SORT_OPTION_KEY)
  if (!stored) return DEFAULT_SORT_OPTION

  if (
    stored === 'name' ||
    stored === 'createdAt' ||
    stored === 'modifiedAt' ||
    stored === 'tagRelevance'
  ) {
    return stored
  }

  localStorage.removeItem(COLLECTION_SORT_OPTION_KEY)
  return DEFAULT_SORT_OPTION
}

const readInitialSortDirection = (): SortDirection => {
  const stored = localStorage.getItem(COLLECTION_SORT_DIRECTION_KEY)
  if (!stored) return DEFAULT_SORT_DIRECTION

  if (stored === 'asc' || stored === 'desc') {
    return stored
  }

  localStorage.removeItem(COLLECTION_SORT_DIRECTION_KEY)
  return DEFAULT_SORT_DIRECTION
}

export function useCollectionSort(
  entries: WorkspaceEntry[],
  options?: { isTagPath?: boolean }
) {
  const isTagPath = options?.isTagPath ?? false
  const [sortOptionState, setSortOptionState] = useState<SortOption>(
    readInitialSortOption
  )
  const [sortDirectionState, setSortDirectionState] =
    useState<SortDirection>(readInitialSortDirection)

  useEffect(() => {
    localStorage.setItem(COLLECTION_SORT_OPTION_KEY, sortOptionState)
  }, [sortOptionState])

  useEffect(() => {
    localStorage.setItem(COLLECTION_SORT_DIRECTION_KEY, sortDirectionState)
  }, [sortDirectionState])

  useEffect(() => {
    if (sortOptionState === 'tagRelevance' && sortDirectionState !== 'desc') {
      setSortDirectionState('desc')
    }
  }, [sortOptionState, sortDirectionState])

  const sortOption =
    sortOptionState === 'tagRelevance' && !isTagPath
      ? DEFAULT_SORT_OPTION
      : sortOptionState

  const sortDirection = sortDirectionState

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

        case 'tagRelevance': {
          const aScore = a.tagSimilarity ?? Number.NEGATIVE_INFINITY
          const bScore = b.tagSimilarity ?? Number.NEGATIVE_INFINITY
          comparison = aScore - bScore
          break
        }

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
    setSortOption: setSortOptionState,
    setSortDirection: setSortDirectionState,
  }
}
