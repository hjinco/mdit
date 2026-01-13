import { useVirtualizer } from '@tanstack/react-virtual'
import { invoke } from '@tauri-apps/api/core'
import {
  ArrowDownIcon,
  ArrowUpAZ,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowUpZA,
  CalendarArrowDown,
  CalendarArrowUp,
  CalendarClockIcon,
  CalendarIcon,
  FolderOpenIcon,
  type LucideIcon,
  PlusIcon,
  RefreshCcwIcon,
  Trash2Icon,
  TypeIcon,
} from 'lucide-react'
import { isAbsolute, join, relative } from 'pathe'
import type { PlateElementProps } from 'platejs/react'
import { PlateElement, useEditorRef } from 'platejs/react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useTabStore } from '@/store/tab-store'
import { useWorkspaceFsStore } from '@/store/workspace-fs-store'
import { useWorkspaceStore, type WorkspaceEntry } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import {
  convertValueToType,
  datePattern,
  type ValueType,
} from '@/utils/frontmatter-value-utils'
import {
  getFileNameWithoutExtension,
  isPathEqualOrDescendant,
  normalizePathSeparators,
  sanitizeFilename,
} from '@/utils/path-utils'
import {
  applySortDirection,
  type BaseSortOption,
  compareOptionalDates,
  compareText,
  type SortDirection,
} from '@/utils/sort-utils'
import { useScrollToNewDatabaseRow } from '../hooks/use-scroll-to-new-database-row'
import { FolderPicker } from './database-folder-picker'
import {
  InlineEditableField,
  PROPERTY_ICONS,
  ValueEditor,
} from './database-property'

type FrontmatterRecord = Record<string, unknown>
type FrontmatterCache = Map<string, FrontmatterRecord>

type ColumnDef = {
  name: string
  type: ValueType
}

type DatabaseSortOption = BaseSortOption | 'none' | `property:${string}`

const DATABASE_SORT_PROPERTY_PREFIX = 'property:'
const DEFAULT_DATABASE_SORT_OPTION: DatabaseSortOption = 'none'
const DEFAULT_DATABASE_SORT_DIRECTION: SortDirection = 'asc'

const DATABASE_SORT_LABELS: Record<BaseSortOption, string> = {
  name: 'Name',
  createdAt: 'Created Date',
  modifiedAt: 'Modified Date',
}

export type TDatabaseElement = {
  type: 'database'
  folder?: string
  sortOption?: DatabaseSortOption
  sortDirection?: SortDirection
  children: [{ text: string }]
}

const EMPTY_ROWS: WorkspaceEntry[] = []
const DEFAULT_ENTRY_BASE_NAME = 'Untitled'

function isPropertySortOption(
  option: DatabaseSortOption
): option is `property:${string}` {
  return option.startsWith(DATABASE_SORT_PROPERTY_PREFIX)
}

function toPropertySortOption(name: string): DatabaseSortOption {
  return `${DATABASE_SORT_PROPERTY_PREFIX}${name}`
}

function getPropertyNameFromSortOption(
  option: DatabaseSortOption
): string | null {
  if (!isPropertySortOption(option)) return null
  return option.slice(DATABASE_SORT_PROPERTY_PREFIX.length)
}

function detectValueType(value: unknown): ValueType {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value)) return 'array'
  if (
    value instanceof Date ||
    (typeof value === 'string' &&
      !Number.isNaN(Date.parse(value)) &&
      datePattern.test(value))
  ) {
    return 'date'
  }
  return 'string'
}

function getDisplayTitle(entry: WorkspaceEntry): string {
  return getFileNameWithoutExtension(entry.name)
}

function normalizeBooleanValue(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  if (value === true || value === false) return value
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value !== 0
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return null
    if (['true', '1', 'yes', 'y'].includes(trimmed)) return true
    if (['false', '0', 'no', 'n'].includes(trimmed)) return false
  }
  return null
}

function parseDateValue(value: unknown): number | null {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (datePattern.test(trimmed)) {
      const date = new Date(trimmed.slice(0, 10))
      if (!Number.isNaN(date.getTime())) return date.getTime()
    }
    const date = new Date(trimmed)
    if (!Number.isNaN(date.getTime())) return date.getTime()
  }
  return null
}

function normalizeSortValue(
  value: unknown,
  type: ValueType
): string | number | boolean | null {
  if (value === null || value === undefined) return null

  switch (type) {
    case 'number': {
      const numeric = Number(value)
      return Number.isNaN(numeric) ? null : numeric
    }
    case 'boolean':
      return normalizeBooleanValue(value)
    case 'date':
      return parseDateValue(value)
    case 'array': {
      if (Array.isArray(value)) {
        const items = value
          .map((item) => String(item ?? '').trim())
          .filter(Boolean)
        return items.length ? items.join(', ') : null
      }
      const str = String(value).trim()
      return str ? str : null
    }
    case 'string': {
      const str = String(value).trim()
      return str ? str : null
    }
    default: {
      const str = String(value).trim()
      return str ? str : null
    }
  }
}

function compareSortValues(
  aValue: unknown,
  bValue: unknown,
  type: ValueType,
  fallbackComparison: number
): number {
  const normalizedA = normalizeSortValue(aValue, type)
  const normalizedB = normalizeSortValue(bValue, type)

  if (normalizedA === null && normalizedB === null) {
    return fallbackComparison
  }
  if (normalizedA === null) return 1
  if (normalizedB === null) return -1

  switch (type) {
    case 'number':
    case 'date':
      return Number(normalizedA) - Number(normalizedB)
    case 'boolean':
      return Number(normalizedA) - Number(normalizedB)
    default:
      return compareText(String(normalizedA), String(normalizedB))
  }
}

function toStoredFolderPath(path: string, workspacePath: string | null) {
  if (!workspacePath) return path
  if (isPathEqualOrDescendant(path, workspacePath)) {
    const relativePath = normalizePathSeparators(relative(workspacePath, path))
    return relativePath || '.'
  }
  return path
}

function resolveFolderPath(
  path: string | undefined,
  workspacePath: string | null
) {
  if (!path) return null
  if (isAbsolute(path)) return path
  if (!workspacePath) return path

  const withoutDotPrefix = path.startsWith('./') ? path.slice(2) : path

  if (withoutDotPrefix === '.' || withoutDotPrefix === '') {
    return workspacePath
  }

  return normalizePathSeparators(join(workspacePath, withoutDotPrefix))
}

function findEntryByNormalizedPath(
  entries: WorkspaceEntry[],
  targetPath: string
): WorkspaceEntry | null {
  const normalizedTarget = normalizePathSeparators(targetPath)

  for (const entry of entries) {
    if (normalizePathSeparators(entry.path) === normalizedTarget) {
      return entry
    }
    if (entry.children) {
      const found = findEntryByNormalizedPath(entry.children, targetPath)
      if (found) {
        return found
      }
    }
  }

  return null
}

function computeDatabaseEntries(
  folderPath: string | null,
  entries: WorkspaceEntry[]
): WorkspaceEntry[] {
  if (!folderPath) {
    return EMPTY_ROWS
  }

  const folderEntry = findEntryByNormalizedPath(entries, folderPath)

  if (!folderEntry || !folderEntry.isDirectory || !folderEntry.children) {
    return EMPTY_ROWS
  }

  return folderEntry.children.filter(
    (entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith('.md')
  )
}

function collectColumnInfo(
  entries: WorkspaceEntry[],
  frontmatterByPath: FrontmatterCache
) {
  const columns = new Set<string>()
  const columnTypes = new Map<string, ValueType>()

  for (const entry of entries) {
    const frontmatter = frontmatterByPath.get(entry.path) ?? {}
    for (const [key, value] of Object.entries(frontmatter)) {
      columns.add(key)
      if (value === null || value === undefined) continue
      const nextType = detectValueType(value)
      const currentType = columnTypes.get(key)
      if (!currentType) {
        columnTypes.set(key, nextType)
      } else if (currentType !== nextType) {
        columnTypes.set(key, 'string')
      }
    }
  }

  return {
    columns: Array.from(columns).sort((a, b) => a.localeCompare(b)),
    columnTypes,
  }
}

function buildColumnDefs(
  columns: string[],
  columnTypes: Map<string, ValueType>
): ColumnDef[] {
  return columns.map((name) => ({
    name,
    type: columnTypes.get(name) ?? 'string',
  }))
}

function getGridTemplateColumns(columnCount: number) {
  const base = 'minmax(240px, 2fr)'
  if (columnCount === 0) return `${base} 40px`
  const extras = Array.from({ length: columnCount })
    .map(() => 'minmax(180px, 1fr)')
    .join(' ')
  return `${base} ${extras} 40px`
}

type DatabaseRowProps = {
  entry: WorkspaceEntry
  frontmatter: FrontmatterRecord | undefined
  columnDefs: ColumnDef[]
  gridTemplateColumns: string
  offsetY: number
  openTab: (path: string) => void
  onUpdateValue: (
    entryPath: string,
    key: string,
    value: unknown,
    type: ValueType
  ) => void
  onRenameTitle: (entry: WorkspaceEntry, newTitle: string) => void
  onDeleteEntry: (path: string) => void
  loadFrontmatter: (path: string) => void
  newlyCreatedPath: string | null
}

function DatabaseRow({
  entry,
  frontmatter,
  columnDefs,
  gridTemplateColumns,
  offsetY,
  openTab,
  onUpdateValue,
  onRenameTitle,
  onDeleteEntry,
  loadFrontmatter,
  newlyCreatedPath,
}: DatabaseRowProps) {
  useEffect(() => {
    if (frontmatter !== undefined) {
      return
    }
    loadFrontmatter(entry.path)
  }, [entry.path, frontmatter, loadFrontmatter])

  const displayTitle = getDisplayTitle(entry)
  const rowFrontmatter = frontmatter ?? {}
  const isNewlyCreated = entry.path === newlyCreatedPath

  return (
    <div
      className="absolute left-0 top-0 grid w-full items-stretch border-b border-border/50 text-sm transition-colors hover:bg-muted/30 group/row"
      style={{
        gridTemplateColumns,
        transform: `translateY(${offsetY}px)`,
        height: '34px',
      }}
    >
      <div className="relative flex items-center border-r border-border/50 px-0 last:border-r-0 group/name overflow-hidden">
        <InlineEditableField
          value={displayTitle}
          placeholder="Untitled"
          onCommit={(newTitle) => onRenameTitle(entry, newTitle)}
          autoEdit={isNewlyCreated}
          buttonProps={{
            className:
              'rounded-none w-full justify-start text-left truncate font-semibold text-foreground px-3 hover:bg-transparent h-full',
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-6 px-2 text-[10px] font-medium tracking-wide rounded border border-border/60 bg-background/80 opacity-0 shadow-sm backdrop-blur-[1px] transition-all hover:bg-background hover:text-foreground group-hover/name:opacity-100 z-20"
          onClick={(e) => {
            e.stopPropagation()
            openTab(entry.path)
          }}
        >
          OPEN
        </Button>
      </div>
      {columnDefs.map((column, index) => {
        const rawValue = rowFrontmatter[column.name]
        const isLastColumn = index === columnDefs.length - 1
        return (
          <div
            key={column.name}
            className={`flex items-center px-0 truncate ${isLastColumn ? '' : 'border-r border-border/50'}`}
          >
            <ValueEditor
              type={column.type}
              value={rawValue}
              onValueChange={(val) =>
                onUpdateValue(entry.path, column.name, val, column.type)
              }
            />
          </div>
        )
      })}
      <div className="flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-transparent transition-colors"
          onClick={() => onDeleteEntry(entry.path)}
        >
          <Trash2Icon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

type DatabaseSortMenuProps = {
  sortOption: DatabaseSortOption
  sortDirection: SortDirection
  columnDefs: ColumnDef[]
  onSortOptionChange: (option: DatabaseSortOption) => void
  onSortDirectionChange: (direction: SortDirection) => void
}

function DatabaseSortMenu({
  sortOption,
  sortDirection,
  columnDefs,
  onSortOptionChange,
  onSortDirectionChange,
}: DatabaseSortMenuProps) {
  const propertyName = getPropertyNameFromSortOption(sortOption)
  const propertyType = propertyName
    ? columnDefs.find((column) => column.name === propertyName)?.type
    : undefined

  const getDirectionLabel = (
    option: DatabaseSortOption,
    direction: SortDirection,
    valueType?: ValueType
  ) => {
    if (
      option === 'createdAt' ||
      option === 'modifiedAt' ||
      valueType === 'date'
    ) {
      return direction === 'desc' ? 'Newest' : 'Oldest'
    }
    if (option === 'name' || valueType === 'string' || valueType === 'array') {
      return direction === 'asc' ? 'A-Z' : 'Z-A'
    }
    return direction === 'asc' ? 'Ascending' : 'Descending'
  }

  const getDirectionIcon = (
    option: DatabaseSortOption,
    direction: SortDirection,
    valueType?: ValueType
  ): LucideIcon => {
    if (
      option === 'createdAt' ||
      option === 'modifiedAt' ||
      valueType === 'date'
    ) {
      return direction === 'desc' ? CalendarArrowDown : CalendarArrowUp
    }
    if (option === 'name' || valueType === 'string' || valueType === 'array') {
      return direction === 'asc' ? ArrowUpAZ : ArrowUpZA
    }
    return direction === 'asc' ? ArrowUpIcon : ArrowDownIcon
  }

  const AscIcon = getDirectionIcon(sortOption, 'asc', propertyType)
  const DescIcon = getDirectionIcon(sortOption, 'desc', propertyType)

  const handleSortOptionChange = (value: string) => {
    if (
      value === 'none' ||
      value === 'name' ||
      value === 'createdAt' ||
      value === 'modifiedAt' ||
      value.startsWith(DATABASE_SORT_PROPERTY_PREFIX)
    ) {
      onSortOptionChange(value as DatabaseSortOption)
    }
  }

  const handleSortDirectionChange = (value: string) => {
    if (value === 'asc' || value === 'desc') {
      onSortDirectionChange(value)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground/70 hover:bg-muted/20 hover:text-foreground"
          aria-label="Sort database"
        >
          <ArrowUpDownIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={sortOption}
          onValueChange={handleSortOptionChange}
        >
          <DropdownMenuRadioItem value="none">
            <ArrowUpDownIcon className="size-4" />
            No sort
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="name">
            <TypeIcon className="size-4" />
            {DATABASE_SORT_LABELS.name}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="createdAt">
            <CalendarIcon className="size-4" />
            {DATABASE_SORT_LABELS.createdAt}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="modifiedAt">
            <CalendarClockIcon className="size-4" />
            {DATABASE_SORT_LABELS.modifiedAt}
          </DropdownMenuRadioItem>
          {columnDefs.length > 0 ? <DropdownMenuSeparator /> : null}
          {columnDefs.map((column) => {
            const Icon = PROPERTY_ICONS[column.type]
            const option = toPropertySortOption(column.name)
            return (
              <DropdownMenuRadioItem key={column.name} value={option}>
                <Icon className="size-4" />
                {column.name}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={sortDirection}
          onValueChange={handleSortDirectionChange}
        >
          <DropdownMenuRadioItem value="asc">
            <AscIcon className="size-4" />
            {getDirectionLabel(sortOption, 'asc', propertyType)}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="desc">
            <DescIcon className="size-4" />
            {getDirectionLabel(sortOption, 'desc', propertyType)}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DatabaseElement(props: PlateElementProps<TDatabaseElement>) {
  const editor = useEditorRef()
  const element = props.element as TDatabaseElement
  const { workspacePath, workspaceEntries, isTreeLoading } = useWorkspaceStore(
    useShallow((state) => ({
      workspacePath: state.workspacePath,
      workspaceEntries: state.entries,
      isTreeLoading: state.isTreeLoading,
    }))
  )
  const { openTab } = useTabStore(
    useShallow((state) => ({
      openTab: state.openTab,
    }))
  )
  const { createNote, deleteEntry, renameEntry, updateFrontmatter } =
    useWorkspaceFsStore(
      useShallow((state) => ({
        createNote: state.createNote,
        deleteEntry: state.deleteEntry,
        renameEntry: state.renameEntry,
        updateFrontmatter: state.updateFrontmatter,
      }))
    )

  const resolvedFolderPath = resolveFolderPath(element.folder, workspacePath)
  const entries = useMemo(() => {
    return computeDatabaseEntries(resolvedFolderPath, workspaceEntries)
  }, [resolvedFolderPath, workspaceEntries])

  const sortOption = element.sortOption ?? DEFAULT_DATABASE_SORT_OPTION
  const sortDirection = element.sortDirection ?? DEFAULT_DATABASE_SORT_DIRECTION

  const updateSortOption = useCallback(
    (nextSortOption: DatabaseSortOption) => {
      const path = props.api.findPath(element)
      if (!path) return
      editor.tf.setNodes(
        { sortOption: nextSortOption },
        {
          at: path,
        }
      )
    },
    [editor, element, props.api]
  )

  const updateSortDirection = useCallback(
    (nextSortDirection: SortDirection) => {
      const path = props.api.findPath(element)
      if (!path) return
      editor.tf.setNodes(
        { sortDirection: nextSortDirection },
        {
          at: path,
        }
      )
    },
    [editor, element, props.api]
  )

  const [frontmatterByPath, setFrontmatterByPath] = useState<FrontmatterCache>(
    new Map()
  )
  const [newlyCreatedPath, setNewlyCreatedPath] = useState<string | null>(null)
  const frontmatterRef = useRef(frontmatterByPath)
  const inFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    frontmatterRef.current = frontmatterByPath
  }, [frontmatterByPath])

  useEffect(() => {
    if (resolvedFolderPath !== undefined) {
      setFrontmatterByPath(new Map())
      inFlightRef.current.clear()
    }
  }, [resolvedFolderPath])

  useEffect(() => {
    if (frontmatterByPath.size === 0) return
    const allowedPaths = new Set(entries.map((entry) => entry.path))
    setFrontmatterByPath((prev) => {
      let hasChanges = false
      const next = new Map<string, FrontmatterRecord>()
      for (const [path, frontmatter] of prev) {
        if (allowedPaths.has(path)) {
          next.set(path, frontmatter)
        } else {
          hasChanges = true
        }
      }
      return hasChanges ? next : prev
    })
  }, [entries, frontmatterByPath.size])

  const loadFrontmatter = useCallback(
    async (path: string, options?: { force?: boolean }) => {
      if (!options?.force) {
        if (frontmatterRef.current.has(path)) return
        if (inFlightRef.current.has(path)) return
      }

      inFlightRef.current.add(path)
      try {
        const result = await invoke<unknown>('get_file_frontmatter', { path })
        const normalized =
          result && typeof result === 'object' && !Array.isArray(result)
            ? (result as FrontmatterRecord)
            : {}
        setFrontmatterByPath((prev) => {
          const next = new Map(prev)
          next.set(path, normalized)
          return next
        })
      } catch (err) {
        console.error('Failed to load frontmatter:', err)
        setFrontmatterByPath((prev) => {
          const next = new Map(prev)
          next.set(path, {})
          return next
        })
      } finally {
        inFlightRef.current.delete(path)
      }
    },
    []
  )

  const updateFolderPath = useCallback(
    (nextPath: string | undefined) => {
      const path = props.api.findPath(element)
      if (!path) return
      editor.tf.setNodes(
        { folder: nextPath },
        {
          at: path,
        }
      )
    },
    [editor, element, props.api]
  )

  const handleSelectFolder = useCallback(
    (selected: string) => {
      const storedPath = toStoredFolderPath(selected, workspacePath)
      updateFolderPath(storedPath)
    },
    [updateFolderPath, workspacePath]
  )

  const handleNewEntry = useCallback(async () => {
    if (!resolvedFolderPath) return

    try {
      const newPath = await createNote(resolvedFolderPath, {
        initialName: DEFAULT_ENTRY_BASE_NAME,
      })
      setNewlyCreatedPath(newPath)
    } catch (err) {
      console.error('Failed to create new database entry:', err)
    }
  }, [createNote, resolvedFolderPath])

  const handleDeleteEntry = useCallback(
    async (path: string) => {
      try {
        await deleteEntry(path)
      } catch (err) {
        console.error('Failed to delete entry:', err)
      }
    },
    [deleteEntry]
  )

  const handleUpdateValue = useCallback(
    async (entryPath: string, key: string, value: unknown, type: ValueType) => {
      try {
        const typedValue = convertValueToType(value, type)
        await updateFrontmatter(entryPath, { [key]: typedValue })
        // Optimistic update
        setFrontmatterByPath((prev) => {
          const next = new Map(prev)
          const existing = next.get(entryPath) ?? {}
          next.set(entryPath, { ...existing, [key]: typedValue })
          return next
        })
      } catch (err) {
        console.error('Failed to update value:', err)
        loadFrontmatter(entryPath, { force: true }) // Rollback
      }
    },
    [loadFrontmatter, updateFrontmatter]
  )

  const handleRenameTitle = useCallback(
    async (entry: WorkspaceEntry, newTitle: string) => {
      const trimmedTitle = newTitle.trim()
      if (!trimmedTitle || trimmedTitle === getDisplayTitle(entry)) return

      try {
        const sanitized = sanitizeFilename(trimmedTitle)
        if (!sanitized) return

        const newFileName = `${sanitized}.md`
        await renameEntry(entry, newFileName)
      } catch (err) {
        console.error('Failed to rename note:', err)
      }
    },
    [renameEntry]
  )

  const { columns, columnTypes } = useMemo(
    () => collectColumnInfo(entries, frontmatterByPath),
    [entries, frontmatterByPath]
  )

  const columnDefs = useMemo(
    () => buildColumnDefs(columns, columnTypes),
    [columns, columnTypes]
  )

  const gridTemplateColumns = useMemo(
    () => getGridTemplateColumns(columns.length),
    [columns.length]
  )

  const sortedEntries = useMemo(() => {
    if (sortOption === 'none') {
      return entries
    }

    const sorted = [...entries].sort((a, b) => {
      const nameComparison = compareText(getDisplayTitle(a), getDisplayTitle(b))
      let comparison = 0

      if (sortOption === 'name') {
        comparison = nameComparison
      } else if (sortOption === 'createdAt') {
        comparison = compareOptionalDates(
          a.createdAt,
          b.createdAt,
          nameComparison
        )
      } else if (sortOption === 'modifiedAt') {
        comparison = compareOptionalDates(
          a.modifiedAt,
          b.modifiedAt,
          nameComparison
        )
      } else {
        const propertyName = getPropertyNameFromSortOption(sortOption)
        const valueType = propertyName
          ? (columnTypes.get(propertyName) ?? 'string')
          : 'string'
        const aValue = propertyName
          ? frontmatterByPath.get(a.path)?.[propertyName]
          : undefined
        const bValue = propertyName
          ? frontmatterByPath.get(b.path)?.[propertyName]
          : undefined
        comparison = compareSortValues(
          aValue,
          bValue,
          valueType,
          nameComparison
        )
      }

      return applySortDirection(comparison, sortDirection)
    })

    return sorted
  }, [entries, sortOption, sortDirection, frontmatterByPath, columnTypes])

  const parentRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: sortedEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 10,
  })

  useScrollToNewDatabaseRow({
    folderPath: resolvedFolderPath,
    sortedEntries,
    newlyCreatedPath,
    virtualizer,
    onScrollComplete: () => {
      setNewlyCreatedPath(null)
    },
  })

  let bodyContent: ReactNode
  if (!resolvedFolderPath) {
    bodyContent = (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-center bg-muted/5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
          <FolderOpenIcon className="h-6 w-6 text-muted-foreground/60" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground/80">
            Empty database
          </p>
          <p className="text-xs text-muted-foreground/60">
            Select a folder from your workspace to display its contents.
          </p>
        </div>
        <FolderPicker
          onSelect={handleSelectFolder}
          currentPath={undefined}
          workspacePath={workspacePath}
        />
      </div>
    )
  } else if (isTreeLoading && sortedEntries.length === 0) {
    bodyContent = (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-sm text-muted-foreground/60 bg-muted/5">
        <RefreshCcwIcon className="h-4 w-4 animate-spin" />
        <span>Loading database...</span>
      </div>
    )
  } else if (sortedEntries.length === 0) {
    bodyContent = (
      <div className="flex flex-col items-center justify-center gap-4 p-12 text-sm text-muted-foreground/60 bg-muted/5">
        <p>No markdown files in this folder.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNewEntry}
          className="h-8 px-4 rounded-md border-muted/50 hover:bg-muted/30 transition-colors"
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Create first entry
        </Button>
      </div>
    )
  } else {
    bodyContent = (
      <div className="flex flex-col max-h-[520px]">
        <div ref={parentRef} className="flex-1 overflow-auto">
          <div className="min-w-fit inline-block align-middle w-full">
            <div
              className="sticky z-20 top-0 grid items-center border-b border-border/50 bg-background text-[12px] font-normal text-muted-foreground"
              style={{ gridTemplateColumns }}
            >
              <div className="flex h-9 items-center border-r border-border/50 px-3 last:border-r-0">
                <TypeIcon className="mr-2 h-3.5 w-3.5 shrink-0 opacity-70" />
                Name
              </div>
              {columnDefs.map((column, index) => {
                const Icon = PROPERTY_ICONS[column.type]
                const isLastColumn = index === columnDefs.length - 1
                return (
                  <div
                    key={column.name}
                    className={`flex h-9 items-center px-3 truncate ${isLastColumn ? '' : 'border-r border-border/50'}`}
                  >
                    <Icon className="mr-2 h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{column.name}</span>
                  </div>
                )
              })}
              <div className="h-9" />
            </div>
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const entry = sortedEntries[virtualItem.index]
                const frontmatter = frontmatterByPath.get(entry.path)

                return (
                  <DatabaseRow
                    key={entry.path}
                    entry={entry}
                    frontmatter={frontmatter}
                    columnDefs={columnDefs}
                    gridTemplateColumns={gridTemplateColumns}
                    offsetY={virtualItem.start}
                    openTab={openTab}
                    onUpdateValue={handleUpdateValue}
                    onRenameTitle={handleRenameTitle}
                    onDeleteEntry={handleDeleteEntry}
                    loadFrontmatter={loadFrontmatter}
                    newlyCreatedPath={newlyCreatedPath}
                  />
                )
              })}
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 border-t border-border/50 bg-background/50 backdrop-blur-sm z-10">
          <button
            type="button"
            className="flex h-9 w-full items-center px-3 text-sm text-muted-foreground/60 transition-colors hover:bg-muted/20 hover:text-muted-foreground group"
            onClick={handleNewEntry}
          >
            <PlusIcon className="mr-2 h-4 w-4 opacity-50 group-hover:opacity-100" />
            New
          </button>
        </div>
      </div>
    )
  }

  return (
    <PlateElement {...props} className="my-2">
      <div
        className="group/database flex flex-col mx-auto"
        contentEditable={false}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <div className="overflow-hidden rounded border bg-background">
          <div className="flex items-center justify-between border-b border-muted/40 bg-muted/5 px-3 py-2.5">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
              {element.folder || 'Database'}
            </div>
            <div className="flex items-center gap-1">
              <DatabaseSortMenu
                sortOption={sortOption}
                sortDirection={sortDirection}
                columnDefs={columnDefs}
                onSortOptionChange={updateSortOption}
                onSortDirectionChange={updateSortDirection}
              />
              <FolderPicker
                onSelect={handleSelectFolder}
                currentPath={element.folder}
                workspacePath={workspacePath}
              />
            </div>
          </div>
          {bodyContent}
        </div>
      </div>
      {props.children}
    </PlateElement>
  )
}
