import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@mdit/ui/components/dropdown-menu"
import { cn } from "@mdit/ui/lib/utils"
import { Check, ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import type { AIMenuEnabledChatModel, AIMenuRuntime } from "./ai-menu.types"

interface AIModelSelectorProps {
	modelPopoverOpen: boolean
	onModelPopoverOpenChange: (open: boolean) => void
	chatConfig: AIMenuRuntime["chatConfig"]
	enabledChatModels: AIMenuEnabledChatModel[]
	onSelectModel: (provider: string, model: string) => void
	canOpenModelSettings: boolean
	onOpenModelSettings: () => void
}

export function AIModelSelector({
	modelPopoverOpen,
	onModelPopoverOpenChange,
	chatConfig,
	enabledChatModels,
	onSelectModel,
	canOpenModelSettings,
	onOpenModelSettings,
}: AIModelSelectorProps) {
	return (
		<div className="flex justify-end items-center gap-1.5 py-1">
			<DropdownMenu
				open={modelPopoverOpen}
				onOpenChange={onModelPopoverOpenChange}
			>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors outline-none cursor-pointer"
					>
						{chatConfig ? chatConfig.model : "Select model"}
						<ChevronDownIcon className="size-3.5 text-muted-foreground/70" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{enabledChatModels.length > 0 ? (
						enabledChatModels.map(({ model, provider }) => {
							const isSelected =
								chatConfig?.provider === provider && chatConfig?.model === model
							return (
								<DropdownMenuItem
									key={`${provider}-${model}`}
									onClick={() => onSelectModel(provider, model)}
									className={cn(
										"text-xs",
										isSelected && "bg-primary/10 text-primary font-medium",
									)}
								>
									<span>{model}</span>
									{isSelected && <Check className="size-3.5 ml-auto" />}
								</DropdownMenuItem>
							)
						})
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							No enabled models
						</div>
					)}
					{canOpenModelSettings && (
						<DropdownMenuItem onClick={onOpenModelSettings} className="text-xs">
							Add models <ChevronRightIcon className="size-3.5 ml-auto" />
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
