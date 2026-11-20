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
		// Comfortable row + rounded pill (Grok-style list)
		`${widthClass} text-left flex items-center gap-1 px-2 py-1.5 text-accent-foreground/90 min-w-0 rounded-xl transition-[background-color,color,box-shadow] duration-150 ease-out outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]`,
		isSelected
			? "bg-foreground/12 text-accent-foreground shadow-sm"
			: isActive
				? "bg-foreground/8 text-accent-foreground/95"
				: "hover:bg-foreground/8 active:bg-foreground/10",
		isDragging && "opacity-10 cursor-grabbing",
		isRenaming && "ring-1 ring-ring/50 bg-foreground/6",
		isLocked && !isRenaming && "animate-pulse",
	)
}
