import { Button } from "@mdit/ui/components/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@mdit/ui/components/tooltip"
import { cn } from "@mdit/ui/lib/utils"
import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from "lucide-react"
import { useShallow } from "zustand/shallow"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import { useStore } from "@/store"

type Props = {
	isOpen: boolean
	onToggle: () => void
}

export function ToggleButton({ isOpen, onToggle }: Props) {
	const { isFocusMode, currentCollectionPath, toggleExplorerHotkey } = useStore(
		useShallow((s) => ({
			isFocusMode: s.isFocusMode,
			currentCollectionPath: s.currentCollectionPath,
			toggleExplorerHotkey: s.hotkeys["toggle-file-explorer"],
		})),
	)
	const isCollectionViewOpen = currentCollectionPath !== null

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className={cn(
						"text-foreground/70 transition-[opacity] duration-500",
						isFocusMode && !isOpen && "pointer-events-none opacity-0",
						(isOpen || isCollectionViewOpen) && "hover:bg-background/40",
					)}
					onClick={onToggle}
				>
					{isOpen ? <ArrowLeftToLineIcon /> : <ArrowRightToLineIcon />}
				</Button>
			</TooltipTrigger>
			<TooltipContent className="pr-1">
				<div className="flex items-center gap-1">
					Toggle
					<HotkeyKbd binding={toggleExplorerHotkey} />
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
