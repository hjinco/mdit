import { ChevronDown, InboxIcon, MinusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { getModifierKey } from "@/utils/keyboard-shortcut"
import { getFolderNameFromPath } from "@/utils/path-utils"

type WorkspaceDropdownProps = {
	workspacePath: string | null
	recentWorkspacePaths: string[]
	onWorkspaceSelect: (path: string) => void
	onWorkspaceRemove: (path: string) => void | Promise<void>
	onOpenFolderPicker: () => void
}

export function WorkspaceDropdown({
	workspacePath,
	recentWorkspacePaths,
	onWorkspaceSelect,
	onWorkspaceRemove,
	onOpenFolderPicker,
}: WorkspaceDropdownProps) {
	const currentWorkspaceName = workspacePath
		? getFolderNameFromPath(workspacePath)
		: "No folder"
	const visibleWorkspacePaths = recentWorkspacePaths.filter(
		(path) => path !== workspacePath,
	)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="text-foreground/90 tracking-tight min-w-0 flex-1 px-1.5! h-8 hover:bg-background/40"
				>
					<InboxIcon className="size-4" />
					<span className="flex-1 text-start text-sm text-overflow-mask">
						{currentWorkspaceName}
					</span>
					<ChevronDown className="ml-auto shrink-0" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64 bg-popover/90">
				{visibleWorkspacePaths.length > 0 ? (
					<>
						{visibleWorkspacePaths.map((path) => (
							<Tooltip key={path} delayDuration={200}>
								<TooltipTrigger asChild>
									<DropdownMenuItem
										onClick={() => onWorkspaceSelect(path)}
										className="group"
									>
										<span className="text-sm text-accent-foreground/90 truncate max-w-full">
											{getFolderNameFromPath(path)}
										</span>
										<button
											type="button"
											className="ml-auto shrink-0 inline-flex size-5 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10"
											onClick={(event) => {
												event.stopPropagation()
												event.preventDefault()
												onWorkspaceRemove(path)
											}}
											aria-label={`Remove ${getFolderNameFromPath(path)} from workspace list`}
										>
											<MinusIcon className="size-3.5 text-muted-foreground group-hover:text-destructive/80" />
										</button>
									</DropdownMenuItem>
								</TooltipTrigger>
								<TooltipContent side="right">
									<p>{path}</p>
								</TooltipContent>
							</Tooltip>
						))}
						<DropdownMenuSeparator />
					</>
				) : null}
				<DropdownMenuItem onClick={onOpenFolderPicker}>
					<span className="text-sm text-accent-foreground/90 mr-auto">
						Open Folder...
					</span>
					<KbdGroup>
						<Kbd>{getModifierKey()}</Kbd>
						<Kbd>O</Kbd>
					</KbdGroup>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
