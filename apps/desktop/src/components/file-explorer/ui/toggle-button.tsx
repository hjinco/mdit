import { Button } from "@mdit/ui/components/button"
import { Kbd, KbdGroup } from "@mdit/ui/components/kbd"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@mdit/ui/components/tooltip"
import { cn } from "@mdit/ui/lib/utils"
import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from "lucide-react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { getModifierKey } from "@/utils/keyboard-shortcut"

type Props = {
	isOpen: boolean
	onToggle: () => void
}

export function ToggleButton({ isOpen, onToggle }: Props) {
	const { isFocusMode, currentCollectionPath } = useStore(
		useShallow((s) => ({
			isFocusMode: s.isFocusMode,
			currentCollectionPath: s.currentCollectionPath,
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
					<KbdGroup>
						<Kbd>{getModifierKey()}</Kbd>
						<Kbd>S</Kbd>
					</KbdGroup>
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
