import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CalendarClockIcon,
  CalendarIcon,
  CaseSensitiveIcon,
  SparklesIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import type { SortDirection, SortOption } from '../hooks/use-collection-sort'

const SORT_LABELS: Record<SortOption, string> = {
  name: 'Name',
  createdAt: 'Created Date',
  modifiedAt: 'Modified Date',
  tagRelevance: 'Relevance',
}

interface SortSelectorProps {
  value: SortOption
  onValueChange: (value: SortOption) => void
  sortDirection: SortDirection
  onDirectionChange: (direction: SortDirection) => void
  enableTagRelevance?: boolean
}

export function SortSelector({
  value,
  onValueChange,
  sortDirection,
  onDirectionChange,
  enableTagRelevance = false,
}: SortSelectorProps) {
  const [open, setOpen] = useState(false)

  const handleValueChange = (newValue: string) => {
    if (
      newValue === 'name' ||
      newValue === 'createdAt' ||
      newValue === 'modifiedAt' ||
      (enableTagRelevance && newValue === 'tagRelevance')
    ) {
      onValueChange(newValue)
      if (newValue === 'tagRelevance') {
        onDirectionChange('desc')
      }
    } else if (newValue === 'asc' || newValue === 'desc') {
      onDirectionChange(newValue)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-foreground/70"
              aria-label="Select sort option"
            >
              <ArrowUpDownIcon />
            </Button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        <TooltipContent>Sort by</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={handleValueChange}>
          <DropdownMenuRadioItem value="modifiedAt">
            <CalendarClockIcon />
            {SORT_LABELS.modifiedAt}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="createdAt">
            <CalendarIcon />
            {SORT_LABELS.createdAt}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="name">
            <CaseSensitiveIcon />
            {SORT_LABELS.name}
          </DropdownMenuRadioItem>
          {enableTagRelevance && (
            <DropdownMenuRadioItem value="tagRelevance">
              <SparklesIcon />
              {SORT_LABELS.tagRelevance}
            </DropdownMenuRadioItem>
          )}
        </DropdownMenuRadioGroup>
        {value !== 'tagRelevance' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sortDirection}
              onValueChange={handleValueChange}
            >
              <DropdownMenuRadioItem value="asc">
                <ArrowUpIcon className="size-4" />
                Ascending
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc">
                <ArrowDownIcon className="size-4" />
                Descending
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
