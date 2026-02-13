import { ArrowLeftToLineIcon, ArrowRightToLineIcon } from "lucide-react"
import { useShallow } from "zustand/shallow"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
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
