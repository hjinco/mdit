import { GitBranchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useStore } from "@/store"

export function GraphViewOpenButton({ disabled }: { disabled: boolean }) {
	const setGraphViewDialogOpen = useStore((s) => s.setGraphViewDialogOpen)

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="text-foreground/80 justify-start hover:bg-background/40 px-1.5!"
			onClick={() => setGraphViewDialogOpen(true)}
			disabled={disabled}
		>
			<GitBranchIcon className="size-4" /> Graph View
		</Button>
	)
}
