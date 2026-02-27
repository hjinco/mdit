import { cn } from "@mdit/ui/lib/utils"
import { ChevronRight } from "lucide-react"
import { TreeNodeRenameInput } from "./tree-node-rename-input"

type TreeInlineEditRowProps = {
	value: string
	setValue: (value: string) => void
	inputRef: React.RefObject<HTMLInputElement | null>
	onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
	onBlur: () => void
	className?: string
	style?: React.CSSProperties
	inputClassName?: string
	iconClassName?: string
}

export function TreeInlineEditRow({
	value,
	setValue,
	inputRef,
	onKeyDown,
	onBlur,
	className,
	style,
	inputClassName,
	iconClassName,
}: TreeInlineEditRowProps) {
	return (
		<div
			className={cn(
				"flex-1 flex items-center py-0.5 ring-1 ring-ring/50 rounded-sm",
				className,
			)}
			style={style}
		>
			<div
				className={cn("shrink-0 pl-1.5 py-1", iconClassName)}
				aria-hidden="true"
			>
				<ChevronRight className="size-4" />
			</div>
			<div className="relative flex-1 min-w-0 flex items-center">
				<span className="text-sm opacity-0">Placeholder</span>
				<TreeNodeRenameInput
					value={value}
					setValue={setValue}
					inputRef={inputRef}
					onKeyDown={onKeyDown}
					onBlur={onBlur}
					className={inputClassName}
				/>
			</div>
		</div>
	)
}
