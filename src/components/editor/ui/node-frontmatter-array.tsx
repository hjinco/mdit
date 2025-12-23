import { XIcon } from 'lucide-react'
import { type KeyboardEvent, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/ui/input'

type FocusRegistration = {
  rowId: string
  columnId: string
  register: (node: HTMLElement | null) => void
}

type FrontmatterArrayProps = {
  value: unknown
  onChange: (nextValue: string[]) => void
  placeholder?: string
  focusRegistration?: FocusRegistration
}

const parseItems = (raw: string) =>
  raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export function FrontmatterArray({
  value,
  onChange,
  placeholder = 'Type and press Enter',
  focusRegistration,
}: FrontmatterArrayProps) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const items = useMemo(() => {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    }
    if (typeof value === 'string') {
      return parseItems(value)
    }
    return []
  }, [value])

  const addItems = (raw: string) => {
    const nextItems = parseItems(raw)
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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addItems(draft)
      return
    }

    if (event.key === 'Backspace' && !draft && items.length) {
      event.preventDefault()
      removeItem(items.length - 1)
    }
  }

  return (
    <div
      className="flex min-h-8 w-full flex-wrap items-center gap-2 bg-background"
      onClick={() => inputRef.current?.focus()}
    >
      {items.map((item, index) => (
        <span
          key={item}
          className="group inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-1 text-sm text-foreground cursor-default"
        >
          <span className="max-w-[12rem] truncate" title={item}>
            {item}
          </span>
          <button
            type="button"
            className="rounded-sm py-0.5 text-muted-foreground transition-colors hover:text-destructive cursor-pointer"
            onClick={(event) => {
              event.stopPropagation()
              removeItem(index)
              inputRef.current?.focus()
            }}
            aria-label={`Remove ${item}`}
            tabIndex={-1}
          >
            <XIcon className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Input
        ref={(node) => {
          inputRef.current = node
          focusRegistration?.register(node)
        }}
        data-row-id={focusRegistration?.rowId}
        data-col-id={focusRegistration?.columnId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={items.length ? '' : placeholder}
        className={cn(
          'flex-1 min-w-[120px] border-none px-2 shadow-none focus-visible:ring-0 focus-visible:border-0 bg-transparent dark:bg-transparent focus-visible:outline-none',
          'rounded-sm data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]'
        )}
      />
    </div>
  )
}
