import { Button } from "@mdit/ui/components/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@mdit/ui/components/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@mdit/ui/components/tooltip"
import { ChevronDown, InboxIcon, MinusIcon } from "lucide-react"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import { useStore } from "@/store"
import { getFolderNameFromPath } from "@/utils/path-utils"

const REMOVE_WORKSPACE_SELECTOR = '[data-remove-workspace="true"]'

function isRemoveWorkspaceTarget(target: EventTarget | null) {
	if (!target || typeof target !== "object") {
		return false
	}
	const maybeElement = target as { closest?: (selector: string) => unknown }
	return (
		typeof maybeElement.closest === "function" &&
		Boolean(maybeElement.closest(REMOVE_WORKSPACE_SELECTOR))
	)
}

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
	const openFolderHotkey = useStore((s) => s.hotkeys["open-folder"])
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
										aria-keyshortcuts="Delete Backspace"
										className="group"
										onPointerDown={(event) => {
											if (!isRemoveWorkspaceTarget(event.target)) {
												return
											}

											const item = event.currentTarget as HTMLElement
											item.dataset.removeTriggered = "true"
											event.preventDefault()
											event.stopPropagation()
											onWorkspaceRemove(path)
										}}
										onKeyDown={(event) => {
											if (event.key !== "Delete" && event.key !== "Backspace") {
												return
											}

											event.preventDefault()
											event.stopPropagation()
											onWorkspaceRemove(path)
										}}
										onSelect={(event) => {
											const item = event.currentTarget as HTMLElement
											if (item.dataset.removeTriggered === "true") {
												delete item.dataset.removeTriggered
												event.preventDefault()
												return
											}

											onWorkspaceSelect(path)
										}}
									>
										<span className="text-sm text-accent-foreground/90 truncate max-w-full">
											{getFolderNameFromPath(path)}
										</span>
										<span
											data-remove-workspace="true"
											aria-hidden="true"
											className="ml-auto shrink-0 inline-flex size-5 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10"
										>
											<MinusIcon className="size-3.5 text-muted-foreground group-hover:text-destructive/80" />
										</span>
										<span className="sr-only">
											Press Delete or Backspace to remove{" "}
											{getFolderNameFromPath(path)} from workspace list
										</span>
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
					<HotkeyKbd binding={openFolderHotkey} />
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
