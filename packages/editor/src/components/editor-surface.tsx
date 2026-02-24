import { cn } from "@mdit/ui/lib/utils"
import {
	Plate,
	PlateContainer,
	PlateContent,
	type PlateEditor,
} from "platejs/react"
import type { KeyboardEvent } from "react"
import { SelectionAreaCursor } from "./selection-area-cursor"

type EditorSurfaceProps = {
	editor: PlateEditor
	placeholder?: string
	onValueChange?: () => void
	onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
	onBlur?: () => void
	containerClassName?: string
	contentClassName?: string
}

export function EditorSurface({
	editor,
	placeholder = "'/' for commands...",
	onValueChange,
	onKeyDown,
	onBlur,
	containerClassName,
	contentClassName,
}: EditorSurfaceProps) {
	return (
		<Plate editor={editor} onValueChange={onValueChange}>
			<PlateContainer
				className={cn(
					"ignore-click-outside/toolbar relative h-full w-full overflow-y-auto caret-primary select-text selection:bg-brand/14 focus-visible:outline-none",
					"[&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand/25 [&_.slate-selection-area]:bg-brand/14",
					containerClassName,
				)}
				onKeyDown={onKeyDown}
			>
				<PlateContent
					className={cn(
						"group/editor relative size-full min-h-[calc(100vh-3rem)] overflow-x-hidden wrap-break-word whitespace-pre-wrap rounded-md px-8 pt-4 pb-72 text-base select-text text-foreground/90 ring-offset-background font-scale-scope focus-visible:outline-none md:pt-16 sm:[padding-left:max(64px,calc(50%-350px))] sm:[padding-right:max(64px,calc(50%-350px))]",
						"placeholder:text-muted-foreground/80 **:data-slate-placeholder:top-1/2! **:data-slate-placeholder:-translate-y-1/2 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100!",
						"[&_strong]:font-bold",
						contentClassName,
					)}
					placeholder={placeholder}
					autoCapitalize="off"
					autoCorrect="off"
					autoComplete="off"
					spellCheck={false}
					disableDefaultStyles
					onBlur={onBlur}
				/>
			</PlateContainer>
			<SelectionAreaCursor />
		</Plate>
	)
}
