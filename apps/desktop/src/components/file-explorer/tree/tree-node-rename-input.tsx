import { cn } from "@mdit/ui/lib/utils"

type TreeNodeRenameInputProps = {
	value: string
	setValue: (value: string) => void
	inputRef: React.RefObject<HTMLInputElement | null>
	onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
	onBlur: () => void
	className?: string
}

export function TreeNodeRenameInput({
	value,
	setValue,
	inputRef,
	onKeyDown,
	onBlur,
	className,
}: TreeNodeRenameInputProps) {
	return (
		<input
			ref={inputRef}
			value={value}
			onChange={(event) => setValue(event.target.value)}
			onKeyDown={onKeyDown}
			onBlur={onBlur}
			className={cn(
				"absolute inset-0 h-full truncate text-sm outline-none text-foreground bg-transparent",
				className,
			)}
			spellCheck={false}
			autoComplete="off"
		/>
	)
}
