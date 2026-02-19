import { cn } from "@/lib/utils"

type TreeNodeRenameInputProps = {
	draftName: string
	setDraftName: (value: string) => void
	inputRef: React.RefObject<HTMLInputElement | null>
	handleRenameKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
	handleRenameBlur: () => void
	className?: string
}

export function TreeNodeRenameInput({
	draftName,
	setDraftName,
	inputRef,
	handleRenameKeyDown,
	handleRenameBlur,
	className,
}: TreeNodeRenameInputProps) {
	return (
		<input
			ref={inputRef}
			value={draftName}
			onChange={(event) => setDraftName(event.target.value)}
			onKeyDown={handleRenameKeyDown}
			onBlur={handleRenameBlur}
			className={cn(
				"absolute inset-0 h-full truncate text-sm outline-none text-foreground bg-transparent",
				className,
			)}
			spellCheck={false}
			autoComplete="off"
		/>
	)
}
