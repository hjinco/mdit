import { CommandItem, CommandList } from "@mdit/ui/components/command"
import { Popover, PopoverContent } from "@mdit/ui/components/popover"

type WikiSuggestionBase = {
	displayName: string
	relativePath: string
	target: string
}

type FrontmatterWikiSuggestionPopoverProps<T extends WikiSuggestionBase> = {
	anchor: HTMLElement | null
	suggestions: T[]
	onSelect: (suggestion: T) => void
}

export function FrontmatterWikiSuggestionPopover<T extends WikiSuggestionBase>({
	anchor,
	suggestions,
	onSelect,
}: FrontmatterWikiSuggestionPopoverProps<T>) {
	if (!anchor) {
		return null
	}

	return (
		<Popover open modal={false}>
			<PopoverContent
				anchor={anchor}
				align="start"
				side="bottom"
				sideOffset={6}
				initialFocus={false}
				className="rounded-md p-0"
				style={{ width: anchor.offsetWidth }}
			>
				<CommandList className="max-h-56 p-1">
					{suggestions.map((suggestion, index) => (
						<CommandItem
							key={`${suggestion.relativePath}-${index}`}
							value={suggestion.target}
							onMouseDown={(event) => {
								event.preventDefault()
							}}
							onSelect={() => onSelect(suggestion)}
							className="flex-col items-start gap-0"
						>
							<div className="w-full truncate font-medium">
								{suggestion.displayName}
							</div>
							<div className="w-full truncate text-xs text-muted-foreground">
								{suggestion.relativePath}
							</div>
						</CommandItem>
					))}
				</CommandList>
			</PopoverContent>
		</Popover>
	)
}
