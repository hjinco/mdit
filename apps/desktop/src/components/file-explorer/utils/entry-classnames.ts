import { cn } from "@mdit/ui/lib/utils"

type GetEntryButtonClassNameParams = {
	isSelected?: boolean
	isActive?: boolean
	isDragging?: boolean
	isRenaming?: boolean
	isLocked?: boolean
	widthClass?: "flex-1" | "w-full"
}

export function getEntryButtonClassName({
	isSelected = false,
	isActive = false,
	isDragging = false,
	isRenaming = false,
	isLocked = false,
	widthClass = "w-full",
}: GetEntryButtonClassNameParams = {}) {
	return cn(
		`${widthClass} text-left flex items-center pr-2 py-0.5 text-accent-foreground/90 min-w-0 rounded-sm transition-opacity cursor-pointer outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]`,
		isSelected
			? "bg-background/80 text-accent-foreground"
			: isActive
				? "bg-background/60 text-accent-foreground/95"
				: "hover:bg-background/40 group-hover:bg-background/40",
		isDragging && "opacity-50 cursor-grabbing",
		isRenaming && "ring-1 ring-ring/50",
		isLocked && !isRenaming && "animate-pulse",
	)
}
