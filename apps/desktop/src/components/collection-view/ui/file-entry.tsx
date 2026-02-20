import { cn } from "@mdit/ui/lib/utils"
import { FileTextIcon, ImageIcon } from "lucide-react"
import type { CSSProperties, MouseEvent } from "react"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { isImageFile } from "@/utils/file-icon"

type FileEntryProps = {
	entry: WorkspaceEntry
	isActive: boolean
	isSelected: boolean
	onClick: (event: MouseEvent<HTMLLIElement>) => void
	onContextMenu: (event: MouseEvent<HTMLLIElement>) => void
	style?: CSSProperties
	"data-index"?: number
}

export function FileEntry({
	entry,
	isActive,
	isSelected,
	onClick,
	onContextMenu,
	style,
	"data-index": dataIndex,
}: FileEntryProps) {
	// Remove extension from display name
	const lastDotIndex = entry.name.lastIndexOf(".")
	const displayName =
		lastDotIndex > 0 ? entry.name.slice(0, lastDotIndex) : entry.name

	// Check if file is an image
	const extension = lastDotIndex > 0 ? entry.name.slice(lastDotIndex) : ""
	const isImage = isImageFile(extension)

	return (
		<li
			onClick={onClick}
			onContextMenu={onContextMenu}
			className={cn(
				"px-2 py-1 text-sm text-foreground/80 rounded-sm flex items-center gap-2 mb-1",
				"hover:bg-muted",
				(isActive || isSelected) && "bg-accent",
			)}
			style={style}
			data-index={dataIndex}
		>
			{isImage ? (
				<ImageIcon className="size-4 shrink-0" />
			) : (
				<FileTextIcon className="size-4 shrink-0" />
			)}
			<span className="truncate cursor-default">{displayName}</span>
		</li>
	)
}
