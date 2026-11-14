import { Button } from "@mdit/ui/components/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@mdit/ui/components/tooltip"
import { SquarePenIcon } from "lucide-react"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import { useDesktopRuntime, useHotkeysState } from "@/state"

export function NewNoteButton({
	directoryPath,
}: {
	directoryPath: string | null
}) {
	const createNote = useDesktopRuntime().workspace.commands.createNote
	const createNoteHotkey = useHotkeysState((s) => s.hotkeys["create-note"])

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="text-foreground/70 hover:bg-background/40"
					onClick={() =>
						directoryPath && createNote(directoryPath, { openTab: true })
					}
				>
					<SquarePenIcon />
				</Button>
			</TooltipTrigger>
			<TooltipContent className="pr-1">
				<div className="flex items-center gap-1">
					New Note
					<HotkeyKbd binding={createNoteHotkey} />
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
