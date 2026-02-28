import { CommandGroup, CommandItem } from "@mdit/ui/components/command"
import { AIChatPlugin } from "@platejs/ai/react"
import { CommandIcon, PlusIcon, XIcon } from "lucide-react"
import { useEditorRef } from "platejs/react"
import { useEffect, useMemo } from "react"
import type {
	AIMenuCommand,
	AIMenuStorage,
	EditorChatState,
} from "./ai-menu.types"
import { getAIMenuItemGroups } from "./ai-menu-items.config"
import { useHiddenDefaultSelectionCommands } from "./use-hidden-default-selection-commands"

export interface AIMenuItemsProps {
	commands: AIMenuCommand[]
	input: string
	setInput: (value: string) => void
	setValue: (value: string) => void
	storage: AIMenuStorage
	disabled: boolean
	menuState: EditorChatState
	onAddCommandOpen: () => void
	onCommandRemove: (type: "selectionCommand", label: string) => void
}

export function AIMenuItems({
	commands,
	input,
	setInput,
	setValue,
	storage,
	disabled,
	menuState,
	onAddCommandOpen,
	onCommandRemove,
}: AIMenuItemsProps) {
	const editor = useEditorRef()
	const { hiddenDefaultValues, hideDefaultCommand } =
		useHiddenDefaultSelectionCommands(storage)

	const menuGroups = useMemo(() => {
		return getAIMenuItemGroups(menuState)
			.map((group) => ({
				...group,
				items: group.items.filter(
					(item) => !hiddenDefaultValues.includes(item.value),
				),
			}))
			.filter((group) => group.items.length > 0)
	}, [hiddenDefaultValues, menuState])

	useEffect(() => {
		let nextValue: string | undefined

		for (const group of menuGroups) {
			if (group.items.length > 0) {
				nextValue = group.items[0]?.value
				break
			}
		}

		if (!nextValue && menuState === "selectionCommand") {
			nextValue = commands[0]?.label ?? "addCommand"
		}

		setValue(nextValue ?? "")
	}, [commands, menuGroups, menuState, setValue])

	return (
		<CommandGroup className="p-1">
			{menuGroups.map((group) =>
				group.items.map((menuItem) => (
					<CommandItem
						className="group [&_svg]:text-muted-foreground"
						key={menuItem.value}
						onSelect={() => {
							menuItem.onSelect({ editor, input })
							setInput("")
						}}
						value={menuItem.value}
						disabled={disabled}
					>
						{menuItem.icon}
						<span>{menuItem.label}</span>
						{menuState === "selectionCommand" && (
							<button
								type="button"
								className="ml-auto size-5 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 group/item"
								onClick={(e) => {
									e.stopPropagation()
									hideDefaultCommand(menuItem.value)
								}}
							>
								<XIcon className="size-3.5 text-muted-foreground group-hover/item:text-destructive/80" />
							</button>
						)}
					</CommandItem>
				)),
			)}
			{menuState === "selectionCommand" &&
				commands.map((command) => (
					<CommandItem
						className="group"
						key={command.label}
						onSelect={() => {
							editor.getApi(AIChatPlugin).aiChat.submit(input, {
								mode: "chat",
								prompt: command.prompt,
								toolName: "edit",
							})
						}}
						value={command.label}
						disabled={disabled}
					>
						<CommandIcon className="text-muted-foreground" />
						<span>{command.label}</span>
						<button
							type="button"
							className="ml-auto size-5 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 group/item"
							onClick={(e) => {
								e.stopPropagation()
								onCommandRemove("selectionCommand", command.label)
							}}
						>
							<XIcon className="size-3.5 text-muted-foreground group-hover/item:text-destructive/80" />
						</button>
					</CommandItem>
				))}
			{menuState === "selectionCommand" && (
				<CommandItem
					className="[&_svg]:text-muted-foreground"
					key="addCommand"
					onSelect={onAddCommandOpen}
					value="addCommand"
					disabled={disabled}
				>
					<PlusIcon />
					<span>Add command</span>
				</CommandItem>
			)}
		</CommandGroup>
	)
}
