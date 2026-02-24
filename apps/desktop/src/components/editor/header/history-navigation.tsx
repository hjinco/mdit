import { Button } from "@mdit/ui/components/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@mdit/ui/components/tooltip"
import type { LucideIcon } from "lucide-react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useShallow } from "zustand/shallow"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import { useStore } from "@/store"

export function HistoryNavigation() {
	const {
		canGoBack,
		canGoForward,
		goBack,
		goForward,
		goBackHotkey,
		goForwardHotkey,
	} = useStore(
		useShallow((s) => ({
			canGoBack: s.historyIndex > 0,
			canGoForward: s.historyIndex < s.history.length - 1,
			goBack: s.goBack,
			goForward: s.goForward,
			goBackHotkey: s.hotkeys["go-back"],
			goForwardHotkey: s.hotkeys["go-forward"],
		})),
	)

	return (
		<div className="items-center gap-0.5 hidden sm:flex">
			<HistoryButton
				icon={ChevronLeft}
				ariaLabel="Go back"
				tooltipLabel="Back"
				binding={goBackHotkey}
				disabled={!canGoBack}
				onClick={goBack}
			/>
			<HistoryButton
				icon={ChevronRight}
				ariaLabel="Go forward"
				tooltipLabel="Forward"
				binding={goForwardHotkey}
				disabled={!canGoForward}
				onClick={goForward}
			/>
		</div>
	)
}

interface HistoryButtonProps {
	icon: LucideIcon
	ariaLabel: string
	tooltipLabel: string
	binding: string
	disabled: boolean
	onClick: () => void
}

function HistoryButton({
	icon: Icon,
	ariaLabel,
	tooltipLabel,
	binding,
	disabled,
	onClick,
}: HistoryButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					aria-label={ariaLabel}
					variant="ghost"
					size="icon"
					className="text-foreground/70 disabled:opacity-50"
					disabled={disabled}
					onClick={onClick}
				>
					<Icon />
				</Button>
			</TooltipTrigger>
			<TooltipContent className="pr-1">
				<div className="flex items-center gap-1">
					{tooltipLabel}
					<HotkeyKbd binding={binding} />
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
