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
  TrashIcon,
  TypeIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
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

type ValueType = 'string' | 'number' | 'boolean' | 'date' | 'array'

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

const datePattern = /^\d{4}-\d{2}-\d{2}/

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

export function detectValueType(value: unknown): ValueType {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value)) return 'array'
  if (
    value instanceof Date ||
    (typeof value === 'string' &&
      !Number.isNaN(Date.parse(value)) &&
      datePattern.test(value))
  )
    return 'date'
  return 'string'
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

function uid() {
  return Math.random().toString(36).slice(2, 9)
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
              className={cn(
                'font-normal',
                !dateValue && 'text-muted-foreground'
              )}
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
        <Input
          defaultValue={Array.isArray(value) ? value.join(', ') : stringValue}
          onBlur={(e) =>
            onValueChange(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          placeholder="Item 1, Item 2, Item 3"
          className="border-none shadow-none focus-visible:ring-0 focus:text-foreground"
        />
      )
    case 'number':
      return (
        <Input
          type="number"
          defaultValue={Number(stringValue)}
          onBlur={(e) => onValueChange(Number(e.target.value))}
          placeholder="Enter a number"
          className="border-none shadow-none focus-visible:ring-0 focus:text-foreground"
        />
      )
    default:
      return (
        <Input
          defaultValue={stringValue}
          onBlur={(e) => onValueChange(e.target.value)}
          placeholder="Enter text"
          className="border-none shadow-none focus-visible:ring-0 focus:text-foreground"
        />
      )
  }
}

export function FrontmatterTable({ data, onChange }: FrontmatterTableProps) {
  const columns = useMemo<ColumnDef<KVRow>[]>(
    () => [
      {
        accessorKey: 'type',
        cell: ({ row }) => {
          const updateType = (newType: ValueType) => {
            const updatedData = data.map((item) =>
              item.id === row.original.id
                ? {
                    ...item,
                    type: newType,
                    value: convertValueToType(item.value, newType),
                  }
                : item
            )
            onChange(updatedData)
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
            const updatedData = data.map((item) =>
              item.id === row.original.id ? { ...item, key: newKey } : item
            )
            onChange(updatedData)
          }

          return (
            <Input
              defaultValue={row.original.key}
              onBlur={(e) => updateKey(e.target.value)}
              placeholder="Property name"
              className="border-none shadow-none focus-visible:ring-0 focus:text-foreground"
            />
          )
        },
      },
      {
        accessorKey: 'value',
        cell: ({ row }) => {
          const updateValue = (newValue: unknown) => {
            const updatedData = data.map((item) =>
              item.id === row.original.id ? { ...item, value: newValue } : item
            )
            onChange(updatedData)
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
            const updatedData = data.filter(
              (item) => item.id !== row.original.id
            )
            onChange(updatedData)
          }

          return (
            <Button
              variant="ghost"
              size="icon"
              onClick={removeRow}
              className="text-muted-foreground hover:text-destructive hover:bg-transparent opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <TrashIcon />
            </Button>
          )
        },
      },
    ],
    [data, onChange]
  )

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const addRow = () => {
    const existing = new Set(data.map((d) => d.key).filter(Boolean))
    const base = 'property'
    let candidate = base
    let i = 1
    while (existing.has(candidate)) {
      candidate = `${base}_${i++}`
    }

    const newRow: KVRow = {
      id: uid(),
      key: candidate,
      value: '',
      type: 'string',
    }
    onChange([...data, newRow])
  }

  return (
    <div className="w-full group/frontmatter">
      <table className="w-full">
        <tbody className="flex flex-col gap-2">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="group flex items-center gap-1">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  style={{
                    flex: cell.column.id === 'value' ? 1 : undefined,
                  }}
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
          className={cn(
            'font-normal transition-opacity',
            data.length === 0
              ? 'opacity-100'
              : 'opacity-0 group-hover/frontmatter:opacity-100'
          )}
        >
          <PlusIcon />
          Add property
        </Button>
      </div>
    </div>
  )
}
