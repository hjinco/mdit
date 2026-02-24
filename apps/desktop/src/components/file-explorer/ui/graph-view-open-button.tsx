import { Button } from "@mdit/ui/components/button"
import { GitBranchIcon } from "lucide-react"
import { useShallow } from "zustand/shallow"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import { useStore } from "@/store"

export function GraphViewOpenButton({ disabled }: { disabled: boolean }) {
	const { openGraphViewDialog, graphViewHotkey } = useStore(
		useShallow((s) => ({
			openGraphViewDialog: s.openGraphViewDialog,
			graphViewHotkey: s.hotkeys["toggle-graph-view"],
		})),
	)

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="text-foreground/80 justify-start group hover:bg-background/40 px-1.5!"
			onClick={openGraphViewDialog}
			disabled={disabled}
		>
			<GitBranchIcon className="size-4" /> Graph View
			<HotkeyKbd
				binding={graphViewHotkey}
				className="ml-auto text-sm text-muted-foreground transition-opacity group-hover:opacity-100 opacity-0"
			/>
		</Button>
	)
}
