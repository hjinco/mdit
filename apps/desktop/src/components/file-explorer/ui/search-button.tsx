import { Button } from "@mdit/ui/components/button"
import { Kbd, KbdGroup } from "@mdit/ui/components/kbd"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@mdit/ui/components/tooltip"
import { SearchIcon } from "lucide-react"
import { useStore } from "@/store"
import { getModifierKey } from "@/utils/keyboard-shortcut"

export function SearchButton() {
	const openCommandMenu = useStore((s) => s.openCommandMenu)
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="text-foreground/70 hover:bg-background/40"
					onClick={openCommandMenu}
				>
					<SearchIcon />
				</Button>
			</TooltipTrigger>
			<TooltipContent className="pr-1">
				<div className="flex items-center gap-1">
					Search
					<KbdGroup>
						<Kbd>{getModifierKey()}</Kbd>
						<Kbd>K</Kbd>
					</KbdGroup>
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
