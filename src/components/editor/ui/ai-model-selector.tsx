import { Check, ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { useShallow } from "zustand/shallow"
import { useCurrentWindowLabel } from "@/hooks/use-current-window-label"
import { cn } from "@/lib/utils"
import { useStore } from "@/store"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu"

interface AIModelSelectorProps {
	modelPopoverOpen: boolean
	onModelPopoverOpenChange: (open: boolean) => void
}

export function AIModelSelector({
	modelPopoverOpen,
	onModelPopoverOpenChange,
}: AIModelSelectorProps) {
	const { enabledChatModels, chatConfig, selectModel, openSettingsWithTab } =
		useStore(
			useShallow((s) => ({
				enabledChatModels: s.enabledChatModels,
				chatConfig: s.chatConfig,
				selectModel: s.selectModel,
				openSettingsWithTab: s.openSettingsWithTab,
			})),
		)
	const windowLabel = useCurrentWindowLabel()

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
									onClick={() => selectModel(provider, model)}
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
					{windowLabel === "main" && (
						<DropdownMenuItem
							onClick={() => openSettingsWithTab("ai")}
							className="text-xs"
						>
							Add models <ChevronRightIcon className="size-3.5 ml-auto" />
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
