import { Button } from "@mdit/ui/components/button"
import { SettingsIcon } from "lucide-react"
import { useStore } from "@/store"
import { getModifierKey } from "@/utils/keyboard-shortcut"

export function SettingsMenu() {
	const setSettingsDialogOpen = useStore((s) => s.setSettingsDialogOpen)

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="text-foreground/80 justify-start group hover:bg-background/40 px-1.5!"
			onClick={() => setSettingsDialogOpen(true)}
		>
			<SettingsIcon className="size-4" /> Settings
			<span className="ml-auto text-sm text-muted-foreground transition-opacity group-hover:opacity-100 opacity-0">
				{getModifierKey()}
				<span className="ml-1">{";"}</span>
			</span>
		</Button>
	)
}
