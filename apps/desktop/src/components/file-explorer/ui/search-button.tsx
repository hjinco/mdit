import { Button } from "@mdit/ui/components/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@mdit/ui/components/tooltip"
import { SearchIcon } from "lucide-react"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import { useStore } from "@/store"

export function SearchButton() {
	const openCommandMenu = useStore((s) => s.openCommandMenu)
	const commandMenuHotkey = useStore((s) => s.hotkeys["open-command-menu"])

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
					<HotkeyKbd binding={commandMenuHotkey} />
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
