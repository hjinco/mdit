export type SortDirection = 'asc' | 'desc'
export type BaseSortOption = 'name' | 'createdAt' | 'modifiedAt'

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function compareOptionalDates(
  a: Date | null | undefined,
  b: Date | null | undefined,
  fallbackComparison: number
): number {
  if (!a && !b) return fallbackComparison
  if (!a) return 1
  if (!b) return -1
  return a.getTime() - b.getTime()
}

export function applySortDirection(
  comparison: number,
  direction: SortDirection
): number {
  return direction === 'asc' ? comparison : -comparison
}

export function compareEntryByBaseOption(
  a: { name: string; createdAt?: Date | null; modifiedAt?: Date | null },
  b: { name: string; createdAt?: Date | null; modifiedAt?: Date | null },
  option: BaseSortOption
): number {
  const nameComparison = compareText(a.name, b.name)

  switch (option) {
    case 'name':
      return nameComparison
    case 'createdAt':
      return compareOptionalDates(a.createdAt, b.createdAt, nameComparison)
    case 'modifiedAt':
      return compareOptionalDates(a.modifiedAt, b.modifiedAt, nameComparison)
    default:
      return nameComparison
  }
}
