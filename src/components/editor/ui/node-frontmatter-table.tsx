import { PopoverContent as PopoverContentPrimitive } from '@radix-ui/react-popover'
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
import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [triggerDimensions, setTriggerDimensions] = useState<{
    width: number
    height: number
  }>({ width: 0, height: 0 })
  const setIsFrontmatterInputting = useEditorStore(
    (s) => s.setIsFrontmatterInputting
  )

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  // biome-ignore lint/correctness/useExhaustiveDependencies: true
  useEffect(() => {
    const node = triggerRef.current
    if (!node) return
    setTriggerDimensions({
      width: node.offsetWidth,
      height: node.offsetHeight,
    })
  }, [isOpen])

  const popoverSideOffset =
    triggerDimensions.height > 0 ? -triggerDimensions.height : 0
  const popoverStyle =
    triggerDimensions.width > 0
      ? { width: `${triggerDimensions.width}px` }
      : undefined

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          setIsFrontmatterInputting(true)
        } else {
          onCommit(inputRef.current!.value)
          setIsFrontmatterInputting(false)
        }
        setIsOpen(open)
      }}
      modal
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          className={cn(
            'w-full justify-start border border-transparent h-9 px-3 text-left truncate',
            !value && 'text-muted-foreground italic'
          )}
          {...buttonProps}
        >
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContentPrimitive
        side="top"
        align="start"
        sideOffset={popoverSideOffset}
        collisionPadding={0}
        avoidCollisions={false}
        style={popoverStyle}
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          setIsFrontmatterInputting(false)
          setIsOpen(false)
        }}
      >
        <Input
          ref={inputRef}
          type={inputType}
          defaultValue={value}
          onFocus={() => setIsFrontmatterInputting(true)}
          onBlur={() => setIsFrontmatterInputting(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onCommit(e.currentTarget.value)
              setIsFrontmatterInputting(false)
              setIsOpen(false)
            }

            // Handle Select All (Ctrl+A / Cmd+A)
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
              e.preventDefault()
              e.stopPropagation()
              inputRef.current?.select()
            }

            // Handle Cut (Ctrl+X / Cmd+X)
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') {
              e.preventDefault()
              e.stopPropagation()
              const input = inputRef.current
              if (
                input &&
                input.selectionStart !== null &&
                input.selectionEnd !== null
              ) {
                const selectedText = input.value.substring(
                  input.selectionStart,
                  input.selectionEnd
                )
                if (selectedText) {
                  navigator.clipboard.writeText(selectedText).then(() => {
                    const newValue =
                      input.value.substring(0, input.selectionStart!) +
                      input.value.substring(input.selectionEnd!)
                    input.value = newValue
                    input.dispatchEvent(new Event('input', { bubbles: true }))
                  })
                }
              }
            }
          }}
          className="bg-background dark:bg-background text-foreground"
          autoFocus
          {...inputProps}
        />
      </PopoverContentPrimitive>
    </Popover>
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
  const setIsFrontmatterInputting = useEditorStore(
    (s) => s.setIsFrontmatterInputting
  )

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
      return (
        <Input
          defaultValue={stringValue}
          onFocus={() => setIsFrontmatterInputting(true)}
          onBlur={(e) => {
            setIsFrontmatterInputting(false)
            onValueChange(e.target.value)
          }}
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
            const updatedData = data.map((item) =>
              item.id === row.original.id
                ? {
                    ...item,
                    value: convertValueToType(newValue, row.original.type),
                  }
                : item
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
              <XIcon />
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
