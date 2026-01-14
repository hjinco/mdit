import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceEntry } from '@/store/workspace/workspace-slice'
import {
  applySortDirection,
  type BaseSortOption,
  compareEntryByBaseOption,
  type SortDirection as SortDirectionType,
} from '@/utils/sort-utils'

export type SortOption = BaseSortOption
export type SortDirection = SortDirectionType

const COLLECTION_SORT_OPTION_KEY = 'collection-sort-option'
const COLLECTION_SORT_DIRECTION_KEY = 'collection-sort-direction'

const DEFAULT_SORT_OPTION: SortOption = 'modifiedAt'
const DEFAULT_SORT_DIRECTION: SortDirection = 'desc'

const readInitialSortOption = (): SortOption => {
  const stored = localStorage.getItem(COLLECTION_SORT_OPTION_KEY)
  if (!stored) return DEFAULT_SORT_OPTION

  if (stored === 'name' || stored === 'createdAt' || stored === 'modifiedAt') {
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

export function useCollectionSort(entries: WorkspaceEntry[]) {
  const [sortOptionState, setSortOptionState] = useState<SortOption>(
    readInitialSortOption
  )
  const [sortDirectionState, setSortDirectionState] = useState<SortDirection>(
    readInitialSortDirection
  )

  useEffect(() => {
    localStorage.setItem(COLLECTION_SORT_OPTION_KEY, sortOptionState)
  }, [sortOptionState])

  useEffect(() => {
    localStorage.setItem(COLLECTION_SORT_DIRECTION_KEY, sortDirectionState)
  }, [sortDirectionState])

  const sortOption = sortOptionState
  const sortDirection = sortDirectionState

  const sortedEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      const comparison = compareEntryByBaseOption(a, b, sortOption)
      return applySortDirection(comparison, sortDirection)
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
