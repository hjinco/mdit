import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  CalendarIcon,
  HashIcon,
  ListIcon,
  PlusIcon,
  ToggleLeftIcon,
  TypeIcon,
  XIcon,
} from 'lucide-react'
import { useEditorRef } from 'platejs/react'
import type { ComponentPropsWithoutRef, HTMLInputTypeAttribute } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/store/editor-store'
import { Button } from '@/ui/button'
import { Calendar } from '@/ui/calendar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Input } from '@/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Switch } from '@/ui/switch'

export type ValueType = 'string' | 'number' | 'boolean' | 'date' | 'array'

export type KVRow = {
  id: string
  key: string
  value: unknown
  type: ValueType
}

const columnsOrder = ['type', 'key', 'value', 'actions'] as const
type ColumnId = (typeof columnsOrder)[number]
const KB_NAV_ATTR = 'data-kb-nav'

type FocusRegistration = {
  rowId: string
  columnId: ColumnId
  register: (node: HTMLElement | null) => void
}

type FrontmatterTableProps = {
  data: KVRow[]
  onChange: (data: KVRow[]) => void
}

export const datePattern = /^\d{4}-\d{2}-\d{2}/

function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseYMDToLocalDate(ymd: string) {
  if (!datePattern.test(ymd)) return
  const [y, m, d] = ymd
    .slice(0, 10)
    .split('-')
    .map((n) => Number(n))
  if (!y || !m || !d) return
  return new Date(y, m - 1, d)
}

export function convertValueToType(
  value: unknown,
  targetType: ValueType
): unknown {
  const strValue = String(value ?? '')

  switch (targetType) {
    case 'boolean': {
      return (
        strValue === 'true' ||
        strValue === '1' ||
        strValue.toLowerCase() === 'yes'
      )
    }
    case 'number': {
      const num = Number(strValue)
      return Number.isNaN(num) ? 0 : num
    }
    case 'date': {
      // Normalize to YYYY-MM-DD (keep local date, avoid timezone shift)
      if (value instanceof Date) {
        return formatLocalDate(value)
      }
      const trimmed = strValue.trim()
      if (!trimmed) {
        return formatLocalDate(new Date())
      }
      // If already in YYYY-MM-DD or YYYY-MM-DDThh:mm..., take first 10
      if (datePattern.test(trimmed)) {
        return trimmed.slice(0, 10)
      }
      // Try parsing other date-like strings
      const dt = new Date(trimmed)
      if (!Number.isNaN(dt.getTime())) {
        return formatLocalDate(dt)
      }
      // Fallback to today if invalid
      return formatLocalDate(new Date())
    }
    case 'array': {
      try {
        return Array.isArray(value)
          ? value
          : strValue
            ? strValue.split(',').map((s) => s.trim())
            : []
      } catch {
        return []
      }
    }
    case 'string': {
      return strValue
    }
    default: {
      return strValue
    }
  }
}

const typeIcons: Record<
  ValueType,
  React.ComponentType<{ className?: string }>
> = {
  string: TypeIcon,
  number: HashIcon,
  boolean: ToggleLeftIcon,
  date: CalendarIcon,
  array: ListIcon,
}

function TypeSelect({
  value,
  onValueChange,
  focusRegistration,
}: {
  value: ValueType
  onValueChange: (newType: ValueType) => void
  focusRegistration?: FocusRegistration
}) {
  const TypeIcon = typeIcons[value]
  const focusAttrs = focusRegistration
    ? {
        ref: focusRegistration.register,
        'data-row-id': focusRegistration.rowId,
        'data-col-id': focusRegistration.columnId,
      }
    : {}

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]"
          {...focusAttrs}
        >
          <TypeIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onValueChange('string')}>
          <TypeIcon />
          <span>Text</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onValueChange('number')}>
          <HashIcon />
          <span>Number</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onValueChange('boolean')}>
          <ToggleLeftIcon />
          <span>Boolean</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onValueChange('date')}>
          <CalendarIcon />
          <span>Date</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onValueChange('array')}>
          <ListIcon />
          <span>Array</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type InlineEditableFieldProps = {
  value: string
  placeholder: string
  onCommit: (nextValue: string) => void
  inputType?: HTMLInputTypeAttribute
  focusRegistration?: FocusRegistration
  buttonProps?: Omit<
    ComponentPropsWithoutRef<typeof Button>,
    'onClick' | 'className' | 'variant'
  >
  inputProps?: Omit<
    ComponentPropsWithoutRef<typeof Input>,
    'value' | 'onChange' | 'onBlur' | 'type' | 'className'
  >
}

const shouldIgnoreArrowNavigation = (element: HTMLElement) => {
  if (element.isContentEditable) return true
  const tag = element.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (element.getAttribute('role') === 'textbox') return true
  return false
}

function InlineEditableField({
  value,
  placeholder,
  onCommit,
  inputType = 'text',
  focusRegistration,
  buttonProps,
  inputProps,
}: InlineEditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const registeredNodeRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isEditing) return
    setTimeout(() => {
      inputRef.current?.select()
    }, 0)
  }, [isEditing])

  const commitAndClose = (nextValue?: string, preserveFocus?: boolean) => {
    const resolved = nextValue ?? inputRef.current?.value ?? ''
    onCommit(resolved)
    setIsEditing(false)
    if (preserveFocus) {
      setTimeout(() => {
        if (registeredNodeRef.current) {
          registeredNodeRef.current.setAttribute(KB_NAV_ATTR, 'true')
          registeredNodeRef.current.focus({ preventScroll: true })
        }
      }, 0)
    }
  }

  const cancelEditing = (preserveFocus?: boolean) => {
    setIsEditing(false)
    if (preserveFocus) {
      setTimeout(() => {
        if (registeredNodeRef.current) {
          registeredNodeRef.current.setAttribute(KB_NAV_ATTR, 'true')
          registeredNodeRef.current.focus({ preventScroll: true })
        }
      }, 0)
    }
  }

  const focusAttrs = focusRegistration
    ? {
        ref: (node: HTMLElement | null) => {
          registeredNodeRef.current = node
          focusRegistration.register(node)
        },
        'data-row-id': focusRegistration.rowId,
        'data-col-id': focusRegistration.columnId,
      }
    : {}

  return (
    <div className="relative w-full h-8">
      {isEditing ? (
        <Input
          ref={(node) => {
            inputRef.current = node
            focusAttrs?.ref?.(node)
          }}
          type={inputType}
          defaultValue={value}
          onBlur={() => {
            commitAndClose()
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            inputProps?.onKeyDown?.(e)
            if (e.key === 'Enter') {
              commitAndClose(undefined, true)
            } else if (e.key === 'Escape') {
              cancelEditing(true)
            }
          }}
          className="bg-background dark:bg-background text-foreground absolute left-0 w-full h-8 -top-[0.5px] border-0"
          autoFocus
          data-row-id={focusAttrs?.['data-row-id']}
          data-col-id={focusAttrs?.['data-col-id']}
          {...inputProps}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'w-full justify-start border border-transparent px-3 text-left truncate data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px] border-none',
            !value && 'text-muted-foreground italic'
          )}
          onClick={() => {
            setIsEditing(true)
          }}
          {...focusAttrs}
          {...buttonProps}
        >
          {value || placeholder}
        </Button>
      )}
    </div>
  )
}

function ValueEditor({
  type,
  value,
  onValueChange,
  focusRegistration,
}: {
  type: ValueType
  value: unknown
  onValueChange: (value: unknown) => void
  focusRegistration?: FocusRegistration
}) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const stringValue = String(value ?? '')

  switch (type) {
    case 'boolean':
      return (
        <div className="h-8 flex items-center justify-start ml-2">
          <Switch
            checked={Boolean(value)}
            onCheckedChange={onValueChange}
            ref={focusRegistration?.register}
            data-row-id={focusRegistration?.rowId}
            data-col-id={focusRegistration?.columnId}
            className="data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]"
          />
        </div>
      )
    case 'date': {
      const normalized =
        value instanceof Date
          ? formatLocalDate(value)
          : datePattern.test(stringValue)
            ? stringValue.slice(0, 10)
            : ''

      const dateValue = normalized ? parseYMDToLocalDate(normalized) : undefined

      return (
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]',
                !dateValue && 'text-muted-foreground'
              )}
              ref={focusRegistration?.register}
              data-row-id={focusRegistration?.rowId}
              data-col-id={focusRegistration?.columnId}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateValue ? (
                dateValue.toLocaleDateString()
              ) : (
                <span>Pick a date</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateValue}
              onSelect={(date) => {
                if (date) {
                  onValueChange(formatLocalDate(date))
                }
                setIsCalendarOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      )
    }
    case 'array':
      return (
        <InlineEditableField
          value={Array.isArray(value) ? value.join(', ') : stringValue}
          placeholder="Item 1, Item 2, Item 3"
          onCommit={(newValue) =>
            onValueChange(
              newValue
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          focusRegistration={focusRegistration}
        />
      )
    case 'number':
      return (
        <InlineEditableField
          value={stringValue}
          placeholder="Enter a number"
          inputType="number"
          onCommit={(newValue) => onValueChange(Number(newValue))}
          focusRegistration={focusRegistration}
        />
      )
    case 'string':
      return (
        <InlineEditableField
          value={stringValue}
          placeholder="Enter text"
          onCommit={(newValue) => onValueChange(newValue)}
          focusRegistration={focusRegistration}
        />
      )
    default:
      return null
  }
}

export function FrontmatterTable({ data, onChange }: FrontmatterTableProps) {
  const cellRefs = useRef<
    Record<string, Partial<Record<ColumnId, HTMLElement | null>>>
  >({})
  const rowOrderRef = useRef<string[]>([])
  const lastKeyboardFocusedRef = useRef<HTMLElement | null>(null)
  const keyboardNavFlagRef = useRef(false)
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  const editor = useEditorRef()
  const { shouldFrontmatterFocus, setShouldFrontmatterFocus } = useEditorStore(
    useShallow((s) => ({
      shouldFrontmatterFocus: s.shouldFrontmatterFocus,
      setShouldFrontmatterFocus: s.setShouldFrontmatterFocus,
    }))
  )

  const [tableData, setTableData] = useState(data)

  useEffect(() => {
    setTableData(data)
  }, [data])

  const updateTableData = useCallback(
    (updater: (rows: KVRow[]) => KVRow[]) => {
      setTableData((prev) => {
        const next = updater(prev)
        onChange(next)
        return next
      })
    },
    [onChange]
  )

  const columns = useMemo<ColumnDef<KVRow>[]>(
    () => [
      {
        accessorKey: 'type',
        cell: ({ row }) => {
          const updateType = (newType: ValueType) => {
            updateTableData((items) =>
              items.map((item) =>
                item.id === row.original.id
                  ? {
                      ...item,
                      type: newType,
                      value: convertValueToType(item.value, newType),
                    }
                  : item
              )
            )
          }

          return (
            <TypeSelect
              value={row.original.type}
              onValueChange={updateType}
              focusRegistration={{
                rowId: row.original.id,
                columnId: 'type',
                register: (node) => {
                  if (!cellRefs.current[row.original.id]) {
                    cellRefs.current[row.original.id] = {}
                  }
                  cellRefs.current[row.original.id].type = node
                },
              }}
            />
          )
        },
      },
      {
        accessorKey: 'key',
        cell: ({ row }) => {
          const updateKey = (newKey: string) => {
            updateTableData((items) =>
              items.map((item) =>
                item.id === row.original.id ? { ...item, key: newKey } : item
              )
            )
          }

          return (
            <InlineEditableField
              value={row.original.key ?? ''}
              placeholder="Property name"
              onCommit={updateKey}
              focusRegistration={{
                rowId: row.original.id,
                columnId: 'key',
                register: (node) => {
                  if (!cellRefs.current[row.original.id]) {
                    cellRefs.current[row.original.id] = {}
                  }
                  cellRefs.current[row.original.id].key = node
                },
              }}
            />
          )
        },
      },
      {
        accessorKey: 'value',
        cell: ({ row }) => {
          const updateValue = (newValue: unknown) => {
            updateTableData((items) =>
              items.map((item) =>
                item.id === row.original.id
                  ? {
                      ...item,
                      value: convertValueToType(newValue, row.original.type),
                    }
                  : item
              )
            )
          }

          return (
            <ValueEditor
              type={row.original.type}
              value={row.original.value}
              onValueChange={updateValue}
              focusRegistration={{
                rowId: row.original.id,
                columnId: 'value',
                register: (node) => {
                  if (!cellRefs.current[row.original.id]) {
                    cellRefs.current[row.original.id] = {}
                  }
                  cellRefs.current[row.original.id].value = node
                },
              }}
            />
          )
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const removeRow = () => {
            updateTableData((items) =>
              items.filter((item) => item.id !== row.original.id)
            )
          }

          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={removeRow}
              className="text-muted-foreground hover:text-destructive hover:bg-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus-visible:opacity-100 data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px] transition-opacity"
              ref={(node) => {
                if (!cellRefs.current[row.original.id]) {
                  cellRefs.current[row.original.id] = {}
                }
                cellRefs.current[row.original.id].actions = node
              }}
              data-row-id={row.original.id}
              data-col-id="actions"
            >
              <XIcon />
            </Button>
          )
        },
      },
    ],
    [updateTableData]
  )

  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  rowOrderRef.current = table.getRowModel().rows.map((row) => row.original.id)

  const focusCell = useCallback((rowId: string, columnId: ColumnId) => {
    const target = cellRefs.current[rowId]?.[columnId]
    if (target) {
      if (
        lastKeyboardFocusedRef.current &&
        lastKeyboardFocusedRef.current !== target
      ) {
        lastKeyboardFocusedRef.current.removeAttribute(KB_NAV_ATTR)
      }
      target.setAttribute(KB_NAV_ATTR, 'true')
      lastKeyboardFocusedRef.current = target
      requestAnimationFrame(() => {
        target.focus({ preventScroll: true })
      })
    }
  }, [])

  useEffect(() => {
    if (!shouldFrontmatterFocus) return
    const firstRowId = rowOrderRef.current[0]
    if (!firstRowId) {
      setShouldFrontmatterFocus(false)
      return
    }
    keyboardNavFlagRef.current = true
    const preferred: ColumnId[] = ['key', 'value', 'type', 'actions']
    for (const col of preferred) {
      if (cellRefs.current[firstRowId]?.[col]) {
        focusCell(firstRowId, col)
        requestAnimationFrame(() => setShouldFrontmatterFocus(false))
        return
      }
    }
    setShouldFrontmatterFocus(false)
  }, [focusCell, setShouldFrontmatterFocus, shouldFrontmatterFocus])

  const focusAddButton = useCallback(() => {
    const target = addButtonRef.current
    if (!target) return false

    if (
      lastKeyboardFocusedRef.current &&
      lastKeyboardFocusedRef.current !== target
    ) {
      lastKeyboardFocusedRef.current.removeAttribute(KB_NAV_ATTR)
    }
    target.setAttribute(KB_NAV_ATTR, 'true')
    lastKeyboardFocusedRef.current = target
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true })
    })
    return true
  }, [])

  const focusEditorSecondElement = useCallback(() => {
    if (!editor || editor.children.length < 2) return false
    keyboardNavFlagRef.current = true
    editor.tf.select([1], { edge: 'start' })
    editor.tf.focus()
    return true
  }, [editor])

  const focusLastRowStart = useCallback(() => {
    const lastRowId = rowOrderRef.current.at(-1)
    if (!lastRowId) return false
    keyboardNavFlagRef.current = true
    const preferred: ColumnId[] = ['type', 'key', 'value', 'actions']
    for (const col of preferred) {
      if (cellRefs.current[lastRowId]?.[col]) {
        focusCell(lastRowId, col)
        return true
      }
    }
    return false
  }, [focusCell])

  const focusLastRowEnd = useCallback(() => {
    const lastRowId = rowOrderRef.current.at(-1)
    if (!lastRowId) return false
    keyboardNavFlagRef.current = true
    const preferred: ColumnId[] = ['actions', 'value', 'key', 'type']
    for (const col of preferred) {
      if (cellRefs.current[lastRowId]?.[col]) {
        focusCell(lastRowId, col)
        return true
      }
    }
    return false
  }, [focusCell])

  const handleTabNavigation = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const target = event.target as HTMLElement | null
      if (!target) return

      const rowId = target.dataset.rowId
      const columnId = target.dataset.colId as ColumnId | undefined
      if (!rowId || !columnId) return

      const rowIndex = rowOrderRef.current.indexOf(rowId)
      const colIndex = columnsOrder.indexOf(columnId)
      if (rowIndex === -1 || colIndex === -1) return

      let nextRowIndex = rowIndex
      let nextColIndex = colIndex + (event.shiftKey ? -1 : 1)

      if (nextColIndex >= columnsOrder.length) {
        nextColIndex = 0
        nextRowIndex += 1
      } else if (nextColIndex < 0) {
        nextColIndex = columnsOrder.length - 1
        nextRowIndex -= 1
      }

      if (
        nextRowIndex < 0 ||
        nextRowIndex >= rowOrderRef.current.length ||
        nextColIndex < 0 ||
        nextColIndex >= columnsOrder.length
      ) {
        if (
          !event.shiftKey &&
          rowIndex === rowOrderRef.current.length - 1 &&
          nextRowIndex >= rowOrderRef.current.length
        ) {
          event.preventDefault()
          keyboardNavFlagRef.current = true
          focusAddButton()
        }
        return
      }

      event.preventDefault()
      keyboardNavFlagRef.current = true
      const nextRowId = rowOrderRef.current[nextRowIndex]
      const nextColId = columnsOrder[nextColIndex]
      focusCell(nextRowId, nextColId)
    },
    [focusAddButton, focusCell]
  )

  const handleArrowNavigation = useCallback(
    (event: React.KeyboardEvent) => {
      const key = event.key
      if (
        key !== 'ArrowUp' &&
        key !== 'ArrowDown' &&
        key !== 'ArrowLeft' &&
        key !== 'ArrowRight'
      ) {
        return
      }

      const target = event.target as HTMLElement | null
      if (!target || shouldIgnoreArrowNavigation(target)) return

      const rowId = target.dataset.rowId
      const columnId = target.dataset.colId as ColumnId | undefined
      if (!rowId || !columnId) return

      const rowIndex = rowOrderRef.current.indexOf(rowId)
      const colIndex = columnsOrder.indexOf(columnId)
      if (rowIndex === -1 || colIndex === -1) return

      if (key === 'ArrowDown' && rowIndex === rowOrderRef.current.length - 1) {
        event.preventDefault()
        keyboardNavFlagRef.current = true
        focusAddButton()
        return
      }

      let nextRowIndex = rowIndex
      let nextColIndex = colIndex

      if (key === 'ArrowUp') nextRowIndex -= 1
      if (key === 'ArrowDown') nextRowIndex += 1
      if (key === 'ArrowLeft') nextColIndex -= 1
      if (key === 'ArrowRight') nextColIndex += 1

      if (
        nextRowIndex < 0 ||
        nextRowIndex >= rowOrderRef.current.length ||
        nextColIndex < 0 ||
        nextColIndex >= columnsOrder.length
      ) {
        return
      }

      event.preventDefault()
      keyboardNavFlagRef.current = true
      const nextRowId = rowOrderRef.current[nextRowIndex]
      const nextColId = columnsOrder[nextColIndex]
      focusCell(nextRowId, nextColId)
    },
    [focusAddButton, focusCell]
  )

  const handleKeyDownCapture = useCallback((event: React.KeyboardEvent) => {
    if (
      event.key === 'Tab' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight'
    ) {
      keyboardNavFlagRef.current = true
    }
  }, [])

  const handlePointerDownCapture = useCallback(() => {
    keyboardNavFlagRef.current = false
  }, [])

  const handleFocusCapture = useCallback((event: React.FocusEvent) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (keyboardNavFlagRef.current) {
      if (
        lastKeyboardFocusedRef.current &&
        lastKeyboardFocusedRef.current !== target
      ) {
        lastKeyboardFocusedRef.current.removeAttribute(KB_NAV_ATTR)
      }
      target.setAttribute(KB_NAV_ATTR, 'true')
      lastKeyboardFocusedRef.current = target
    } else if (
      lastKeyboardFocusedRef.current &&
      lastKeyboardFocusedRef.current !== target &&
      lastKeyboardFocusedRef.current.getAttribute(KB_NAV_ATTR)
    ) {
      lastKeyboardFocusedRef.current.removeAttribute(KB_NAV_ATTR)
      lastKeyboardFocusedRef.current = null
    }
  }, [])

  const handleBlurCapture = useCallback((event: React.FocusEvent) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.getAttribute(KB_NAV_ATTR)) {
      target.removeAttribute(KB_NAV_ATTR)
      if (lastKeyboardFocusedRef.current === target) {
        lastKeyboardFocusedRef.current = null
      }
    }
  }, [])

  const handleAddButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
        const moved =
          event.key === 'ArrowUp' ? focusLastRowStart() : focusLastRowEnd()
        if (moved) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }
      if (event.key === 'Tab' && !event.shiftKey) {
        const moved = focusEditorSecondElement()
        if (moved) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        const moved = focusEditorSecondElement()
        if (moved) {
          event.preventDefault()
          event.stopPropagation()
        }
      }
    },
    [focusEditorSecondElement, focusLastRowEnd, focusLastRowStart]
  )

  const addRow = () => {
    const existing = new Set(tableData.map((d) => d.key).filter(Boolean))
    const base = 'property'
    let candidate = base
    let i = 1
    while (existing.has(candidate)) {
      candidate = `${base}_${i++}`
    }

    const newRow: KVRow = {
      id: crypto.randomUUID(),
      key: candidate,
      value: '',
      type: 'string',
    }
    updateTableData((items) => [...items, newRow])
  }

  return (
    <div
      className="w-full"
      onKeyDownCapture={(event) => {
        handleKeyDownCapture(event)
        handleTabNavigation(event)
        handleArrowNavigation(event)
      }}
      onPointerDownCapture={handlePointerDownCapture}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      <table className="w-full">
        <tbody className="flex flex-col gap-2">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="group flex items-start gap-1">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cn(
                    cell.column.id === 'value' && 'flex-1 min-w-0',
                    cell.column.id === 'key' && 'basis-48 shrink-0 w-48'
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2">
        <Button
          onClick={addRow}
          variant="ghost"
          size="sm"
          className="data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]"
          ref={addButtonRef}
          onKeyDownCapture={handleAddButtonKeyDown}
        >
          <PlusIcon />
          Add property
        </Button>
      </div>
    </div>
  )
}
