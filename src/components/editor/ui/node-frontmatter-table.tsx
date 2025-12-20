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
import type { ComponentPropsWithoutRef, HTMLInputTypeAttribute } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
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
}: {
  value: ValueType
  onValueChange: (newType: ValueType) => void
}) {
  const TypeIcon = typeIcons[value]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
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
  buttonProps?: Omit<
    ComponentPropsWithoutRef<typeof Button>,
    'onClick' | 'className' | 'variant'
  >
  inputProps?: Omit<
    ComponentPropsWithoutRef<typeof Input>,
    'ref' | 'value' | 'onChange' | 'onBlur' | 'onKeyDown' | 'type' | 'className'
  >
}

function InlineEditableField({
  value,
  placeholder,
  onCommit,
  inputType = 'text',
  buttonProps,
  inputProps,
}: InlineEditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isEditing) return
    setTimeout(() => {
      inputRef.current?.select()
    }, 0)
  }, [isEditing])

  const commitAndClose = (nextValue?: string) => {
    const resolved = nextValue ?? inputRef.current?.value ?? ''
    onCommit(resolved)
    setIsEditing(false)
  }

  const cancelEditing = () => {
    setIsEditing(false)
  }

  return (
    <div className="relative w-full h-8">
      {isEditing ? (
        <Input
          ref={inputRef}
          type={inputType}
          defaultValue={value}
          onBlur={() => commitAndClose()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              commitAndClose()
            } else if (e.key === 'Escape') {
              cancelEditing()
            }
          }}
          className="bg-background dark:bg-background text-foreground absolute left-0 w-full h-8 -top-[0.5px]"
          autoFocus
          {...inputProps}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            'w-full justify-start border border-transparent px-3 text-left truncate',
            !value && 'text-muted-foreground italic'
          )}
          onClick={() => {
            setIsEditing(true)
          }}
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
}: {
  type: ValueType
  value: unknown
  onValueChange: (value: unknown) => void
}) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const stringValue = String(value ?? '')

  switch (type) {
    case 'boolean':
      return (
        <div className="flex items-center justify-start ml-2">
          <Switch checked={Boolean(value)} onCheckedChange={onValueChange} />
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
              className={cn(!dateValue && 'text-muted-foreground')}
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
        />
      )
    case 'number':
      return (
        <InlineEditableField
          value={stringValue}
          placeholder="Enter a number"
          inputType="number"
          onCommit={(newValue) => onValueChange(Number(newValue))}
        />
      )
    case 'string':
      return (
        <InlineEditableField
          value={stringValue}
          placeholder="Enter text"
          onCommit={(newValue) => onValueChange(newValue)}
        />
      )
    default:
      return null
  }
}

export function FrontmatterTable({ data, onChange }: FrontmatterTableProps) {
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
            <TypeSelect value={row.original.type} onValueChange={updateType} />
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
              className="text-muted-foreground hover:text-destructive hover:bg-transparent opacity-0 group-hover:opacity-100 transition-opacity"
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
    <div className="w-full">
      <table className="w-full">
        <tbody className="flex flex-col gap-2">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="group flex items-center gap-1">
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
        <Button onClick={addRow} variant="ghost" size="sm">
          <PlusIcon />
          Add property
        </Button>
      </div>
    </div>
  )
}
