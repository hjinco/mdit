import { Button } from "@mdit/ui/components/button"
import { GitBranchIcon } from "lucide-react"
import { useStore } from "@/store"
import { getModifierKey } from "@/utils/keyboard-shortcut"

export function GraphViewOpenButton({ disabled }: { disabled: boolean }) {
	const openGraphViewDialog = useStore((s) => s.openGraphViewDialog)

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
			<span className="ml-auto text-sm text-muted-foreground transition-opacity group-hover:opacity-100 opacity-0">
				{getModifierKey()}
				<span className="ml-1">G</span>
			</span>
		</Button>
	)
}
