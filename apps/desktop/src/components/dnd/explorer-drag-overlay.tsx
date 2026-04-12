import { cn } from "@mdit/ui/lib/utils"
import { ChevronRight } from "lucide-react"
import type { FileEntryDragData } from "./dnd-types"

type ExplorerDragOverlayProps = {
	name: string
	isDirectory: boolean
}

export function getExplorerDragOverlayName(data: FileEntryDragData): string {
	return data.displayName ?? data.name ?? ""
}

function getExplorerDragOverlayClassName(isDirectory: boolean) {
	return cn(
		"pointer-events-none flex min-w-0 max-w-80 items-center gap-1 rounded-sm bg-transparent px-0 py-0 text-sm text-accent-foreground/95 shadow-none ring-0 outline-none border-0",
		isDirectory ? "pr-2" : "pr-1",
	)
}

export function ExplorerDragOverlay({
	name,
	isDirectory,
}: ExplorerDragOverlayProps) {
	return (
		<div className={getExplorerDragOverlayClassName(isDirectory)}>
			{isDirectory ? (
				<div
					className="shrink-0 pl-1.5 py-1 text-foreground/70"
					aria-hidden="true"
				>
					<ChevronRight className="size-4" />
				</div>
			) : null}
			<div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
				{name}
			</div>
		</div>
	)
}
