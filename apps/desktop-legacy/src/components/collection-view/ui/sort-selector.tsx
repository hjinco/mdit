import { Button } from "@mdit/ui/components/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@mdit/ui/components/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@mdit/ui/components/tooltip"
import {
	ArrowDownIcon,
	ArrowUpAZ,
	ArrowUpDownIcon,
	ArrowUpIcon,
	ArrowUpZA,
	CalendarArrowDown,
	CalendarArrowUp,
	CalendarClockIcon,
	CalendarIcon,
	CaseSensitiveIcon,
	type LucideIcon,
} from "lucide-react"
import { useState } from "react"
import type { SortDirection, SortOption } from "../hooks/use-collection-sort"

const SORT_LABELS: Record<SortOption, string> = {
	name: "Name",
	createdAt: "Created Date",
	modifiedAt: "Modified Date",
}

function getDirectionLabel(
	sortOption: SortOption,
	direction: SortDirection,
): string {
	if (sortOption === "modifiedAt" || sortOption === "createdAt") {
		return direction === "desc" ? "Newest" : "Oldest"
	}
	if (sortOption === "name") {
		return direction === "asc" ? "A-Z" : "Z-A"
	}
	return direction === "asc" ? "Ascending" : "Descending"
}

function getDirectionIcon(
	sortOption: SortOption,
	direction: SortDirection,
): LucideIcon {
	if (sortOption === "modifiedAt" || sortOption === "createdAt") {
		return direction === "desc" ? CalendarArrowDown : CalendarArrowUp
	}
	if (sortOption === "name") {
		return direction === "asc" ? ArrowUpAZ : ArrowUpZA
	}
	return direction === "asc" ? ArrowUpIcon : ArrowDownIcon
}

interface SortSelectorProps {
	value: SortOption
	onValueChange: (value: SortOption) => void
	sortDirection: SortDirection
	onDirectionChange: (direction: SortDirection) => void
}

export function SortSelector({
	value,
	onValueChange,
	sortDirection,
	onDirectionChange,
}: SortSelectorProps) {
	const [open, setOpen] = useState(false)

	const AscIcon = getDirectionIcon(value, "asc")
	const DescIcon = getDirectionIcon(value, "desc")

	const handleValueChange = (newValue: string) => {
		if (
			newValue === "name" ||
			newValue === "createdAt" ||
			newValue === "modifiedAt"
		) {
			onValueChange(newValue)
		} else if (newValue === "asc" || newValue === "desc") {
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
							className="text-foreground/70 hover:bg-background/40"
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
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuRadioGroup
					value={sortDirection}
					onValueChange={handleValueChange}
				>
					<DropdownMenuRadioItem value="asc">
						<AscIcon className="size-4" />
						{getDirectionLabel(value, "asc")}
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="desc">
						<DescIcon className="size-4" />
						{getDirectionLabel(value, "desc")}
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
