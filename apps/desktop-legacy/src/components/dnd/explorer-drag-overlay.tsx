import { cn } from "@mdit/ui/lib/utils"
import { ChevronRight } from "lucide-react"
import { type CSSProperties, useMemo } from "react"
import type { FileEntryDragData } from "./dnd-types"

type ExplorerDragOverlayProps = {
	name: string
	isDirectory: boolean
	sourceElement?: Element | null
}

export function getExplorerDragOverlayName(data: FileEntryDragData): string {
	return data.displayName ?? data.name ?? ""
}

export function getExplorerDragOverlayStyle(
	sourceElement?: Element | null,
): CSSProperties | undefined {
	if (!sourceElement || !("getBoundingClientRect" in sourceElement)) {
		return undefined
	}

	const ownerWindow = sourceElement.ownerDocument?.defaultView
	if (!ownerWindow?.getComputedStyle) {
		return undefined
	}

	const rect = sourceElement.getBoundingClientRect()
	const computedStyle = ownerWindow.getComputedStyle(sourceElement)

	return {
		boxSizing:
			(computedStyle.boxSizing as CSSProperties["boxSizing"]) || "border-box",
		paddingTop: computedStyle.paddingTop,
		paddingRight: computedStyle.paddingRight,
		paddingBottom: computedStyle.paddingBottom,
		paddingLeft: computedStyle.paddingLeft,
		width: rect.width > 0 ? `${rect.width}px` : undefined,
	}
}

function getExplorerDragOverlayClassName(isDirectory: boolean) {
	return cn(
		"pointer-events-none flex min-w-0 max-w-none items-center gap-1 rounded-sm bg-transparent px-0 py-0 text-sm text-accent-foreground/95 shadow-none ring-0 outline-none border-0",
		isDirectory ? "pr-2" : "pr-1",
	)
}

export function ExplorerDragOverlay({
	name,
	isDirectory,
	sourceElement,
}: ExplorerDragOverlayProps) {
	const style = useMemo(
		() => getExplorerDragOverlayStyle(sourceElement),
		[sourceElement],
	)

	return (
		<div className={getExplorerDragOverlayClassName(isDirectory)} style={style}>
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
