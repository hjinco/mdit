import { Button } from "@mdit/ui/components/button"
import { SettingsIcon } from "lucide-react"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import { useDesktopRuntime, useHotkeysState } from "@/state"

export function SettingsMenu() {
	const setSettingsDialogOpen =
		useDesktopRuntime().window.commands.setSettingsDialogOpen
	const settingsHotkey = useHotkeysState((s) => s.hotkeys["toggle-settings"])

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="text-foreground/80 justify-start group hover:bg-background/40 px-1.5!"
			onClick={() => setSettingsDialogOpen(true)}
		>
			<SettingsIcon className="size-4" /> Settings
			<HotkeyKbd
				binding={settingsHotkey}
				className="ml-auto text-sm text-muted-foreground transition-opacity group-hover:opacity-100 opacity-0"
			/>
		</Button>
	)
}
