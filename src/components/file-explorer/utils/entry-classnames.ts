import { cn } from '@/lib/utils'

type GetEntryButtonClassNameParams = {
  isSelected?: boolean
  isDragging?: boolean
  isRenaming?: boolean
  isAiRenaming?: boolean
  widthClass?: 'flex-1' | 'w-full'
}

export function getEntryButtonClassName({
  isSelected = false,
  isDragging = false,
  isRenaming = false,
  isAiRenaming = false,
  widthClass = 'w-full',
}: GetEntryButtonClassNameParams = {}) {
  return cn(
    `${widthClass} text-left flex items-center pr-2 py-0.5 text-accent-foreground/90 min-w-0 rounded-sm transition-opacity cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]`,
    isSelected
      ? 'bg-background/80 text-accent-foreground'
      : 'hover:bg-background/40',
    isDragging && 'opacity-50 cursor-grabbing',
    isRenaming && 'ring-1 ring-ring/50',
    isAiRenaming && 'animate-pulse'
  )
}
