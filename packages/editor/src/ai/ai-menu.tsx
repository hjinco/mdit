import { Popover, PopoverContent } from "@mdit/ui/components/popover"
import type { EditableSiblingComponent } from "platejs/react"
import type { AIMenuHostDeps } from "./ai-menu.types"
import { AIMenuAddCommand } from "./ai-menu-add-command"
import { AIMenuContent } from "./ai-menu-content"
import { useAIMenuController } from "./use-ai-menu-controller"

type AIMenuProps = {
	host: AIMenuHostDeps
}

export function AIMenu({ host }: AIMenuProps) {
	const {
		addCommandOpen,
		anchorElement,
		chatConfig,
		enabledChatModels,
		commands,
		input,
		isLicenseValid,
		isLoading,
		menuState,
		messages,
		modelPopoverOpen,
		canOpenModelSettings,
		onAddCommand,
		onAddCommandClose,
		onAddCommandOpen,
		onCommandRemove,
		onInputChange,
		onInputClick,
		onInputKeyDown,
		onModelPopoverOpenChange,
		onOpenModelSettings,
		onPopoverOpenChange,
		onSelectModel,
		onSubmit,
		onValueChange,
		open,
		shouldRender,
		value,
	} = useAIMenuController(host)

	if (!shouldRender) return null

	return (
		<Popover open={open} onOpenChange={onPopoverOpenChange}>
			<PopoverContent
				anchor={anchorElement ?? undefined}
				// For the animation
				key={addCommandOpen ? "addCommand" : "content"}
				className="border-none bg-transparent backdrop-blur-none p-0 shadow-none"
				align="center"
				side="bottom"
				style={{
					width: anchorElement?.offsetWidth,
				}}
			>
				{addCommandOpen ? (
					<AIMenuAddCommand onAdd={onAddCommand} onClose={onAddCommandClose} />
				) : (
					<AIMenuContent
						chatConfig={chatConfig}
						enabledChatModels={enabledChatModels}
						modelPopoverOpen={modelPopoverOpen}
						isLoading={isLoading}
						messages={messages}
						commands={commands}
						input={input}
						value={value}
						menuState={menuState}
						storage={host.storage}
						isLicenseValid={isLicenseValid}
						canOpenModelSettings={canOpenModelSettings}
						onModelPopoverOpenChange={onModelPopoverOpenChange}
						onSelectModel={onSelectModel}
						onOpenModelSettings={onOpenModelSettings}
						onValueChange={onValueChange}
						onInputChange={onInputChange}
						onInputClick={onInputClick}
						onSubmit={onSubmit}
						onInputKeyDown={onInputKeyDown}
						onAddCommandOpen={onAddCommandOpen}
						onCommandRemove={onCommandRemove}
					/>
				)}
			</PopoverContent>
		</Popover>
	)
}

export const createAIMenu = (
	host: AIMenuHostDeps,
): EditableSiblingComponent => {
	return () => <AIMenu host={host} />
}
