import {
  CalendarIcon,
  HashIcon,
  ListIcon,
  ToggleLeftIcon,
  TypeIcon,
} from 'lucide-react'
import type {
  ComponentPropsWithoutRef,
  ComponentType,
  HTMLInputTypeAttribute,
} from 'react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Calendar } from '@/ui/calendar'
import { Checkbox } from '@/ui/checkbox'
import { Input } from '@/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import {
  datePattern,
  formatLocalDate,
  parseYMDToLocalDate,
  type ValueType,
} from '@/utils/frontmatter-value-utils'

export const PROPERTY_ICONS: Record<
  ValueType,
  ComponentType<{ className?: string }>
> = {
  string: TypeIcon,
  number: HashIcon,
  boolean: ToggleLeftIcon,
  date: CalendarIcon,
  array: ListIcon,
}

type InlineEditableFieldProps = {
  value: string
  placeholder: string
  onCommit: (nextValue: string) => void
  inputType?: HTMLInputTypeAttribute
  className?: string
  autoEdit?: boolean
  buttonProps?: Omit<
    ComponentPropsWithoutRef<typeof Button>,
    'onClick' | 'variant'
  >
  inputProps?: Omit<
    ComponentPropsWithoutRef<typeof Input>,
    'value' | 'onChange' | 'onBlur' | 'type' | 'className'
  >
}

export function InlineEditableField({
  value,
  placeholder,
  onCommit,
  inputType = 'text',
  className,
  autoEdit = false,
  buttonProps,
  inputProps,
}: InlineEditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasAutoEdited = useRef(false)

  useEffect(() => {
    if (autoEdit && !isEditing && !hasAutoEdited.current) {
      hasAutoEdited.current = true
      // Add a small delay to ensure scrolling completes before focusing
      const timer = setTimeout(() => {
        setIsEditing(true)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [autoEdit, isEditing])

  useEffect(() => {
    if (!isEditing) return
    const timer = setTimeout(() => {
      inputRef.current?.focus()
      if (inputType !== 'number') {
        inputRef.current?.select()
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [isEditing, inputType])

  const commitAndClose = (nextValue?: string) => {
    const resolved = nextValue ?? inputRef.current?.value ?? ''
    onCommit(resolved)
    setIsEditing(false)
  }

  return (
    <div className="group/cell relative flex h-full min-h-[34px] w-full items-center">
      {isEditing ? (
        <div className="absolute inset-0 z-10 flex items-center bg-background ring-2 ring-primary/50">
          <Input
            ref={(node) => {
              inputRef.current = node
            }}
            type={inputType}
            defaultValue={value}
            onBlur={() => commitAndClose()}
            onKeyDown={(event) => {
              event.stopPropagation()
              inputProps?.onKeyDown?.(event)
              if (event.key === 'Enter') {
                commitAndClose()
              } else if (event.key === 'Escape') {
                setIsEditing(false)
              }
            }}
            className={cn(
              'h-full w-full rounded-none border-0 bg-transparent px-3 text-sm text-foreground focus-visible:ring-0 focus-visible:ring-offset-0',
              className
            )}
            autoFocus
            {...inputProps}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          {...buttonProps}
          className={cn(
            'h-full w-full justify-start rounded-none px-3 text-left text-sm font-normal text-foreground/90 hover:bg-muted/30',
            !value && 'text-muted-foreground/60',
            className,
            buttonProps?.className
          )}
          onClick={() => {
            setIsEditing(true)
          }}
        >
          <span className="truncate">{value || placeholder}</span>
        </Button>
      )}
    </div>
  )
}

type ArrayEditorProps = {
  value: unknown
  onChange: (nextValue: string[]) => void
  placeholder?: string
}

function parseArrayItems(raw: string) {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function DatabaseArrayEditor({
  value,
  onChange,
  placeholder = 'Add tags...',
}: ArrayEditorProps) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const items = Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : typeof value === 'string'
      ? parseArrayItems(value)
      : []

  const addItems = (raw: string) => {
    const nextItems = parseArrayItems(raw)
    if (!nextItems.length) return
    const merged = [...items]
    for (const item of nextItems) {
      if (!merged.includes(item)) {
        merged.push(item)
      }
    }
    onChange(merged)
    setDraft('')
  }

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index)
    onChange(next)
  }

  return (
    <div
      className="flex h-full min-h-[34px] w-full items-center gap-1.5 overflow-x-auto px-3 text-sm"
      onClick={() => inputRef.current?.focus()}
    >
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className="inline-flex items-center gap-1 rounded-[3px] bg-muted/60 px-1.5 py-0.5 text-[12px] text-foreground/90"
        >
          <span className="max-w-[8rem] truncate" title={item}>
            {item}
          </span>
          <button
            type="button"
            className="text-muted-foreground/60 hover:text-destructive transition-colors"
            onClick={(event) => {
              event.stopPropagation()
              removeItem(index)
            }}
            aria-label={`Remove ${item}`}
            tabIndex={-1}
          >
            ×
          </button>
        </span>
      ))}
      <Input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            addItems(draft)
          } else if (event.key === 'Backspace' && !draft && items.length) {
            event.preventDefault()
            removeItem(items.length - 1)
          }
        }}
        placeholder={items.length ? '' : placeholder}
        className="h-7 w-[120px] border-0 bg-transparent px-1 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/40"
      />
    </div>
  )
}

export function ValueEditor({
  type,
  value,
  onValueChange,
  className,
}: {
  type: ValueType
  value: unknown
  onValueChange: (value: unknown) => void
  className?: string
}) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const stringValue = String(value ?? '')

  switch (type) {
    case 'boolean':
      return (
        <div
          className={cn(
            'flex h-full min-h-[34px] items-center px-3',
            className
          )}
        >
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(checked) => onValueChange(checked === true)}
            className="h-4 w-4 rounded-[3px]"
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
                'h-full min-h-[34px] w-full justify-start rounded-none px-3 text-left text-sm font-normal text-foreground/90 hover:bg-muted/30',
                !dateValue && 'text-muted-foreground/60',
                className
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground/70" />
              <span className="truncate">
                {dateValue ? dateValue.toLocaleDateString() : 'No date'}
              </span>
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
        <div className={cn('h-full w-full', className)}>
          <DatabaseArrayEditor value={value} onChange={onValueChange} />
        </div>
      )
    case 'number':
      return (
        <InlineEditableField
          value={stringValue}
          placeholder="Empty"
          inputType="number"
          onCommit={(newValue) =>
            onValueChange(newValue ? Number(newValue) : null)
          }
          className={className}
        />
      )
    case 'string':
      return (
        <InlineEditableField
          value={stringValue}
          placeholder="Empty"
          onCommit={(newValue) => onValueChange(newValue)}
          className={className}
        />
      )
    default:
      return null
  }
}
