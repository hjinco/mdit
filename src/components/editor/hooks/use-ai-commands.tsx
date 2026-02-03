import { useState } from "react"

export type Command = {
	type: "selectionCommand"
	label: string
	prompt: string
}

export function useAICommands() {
	const [commands, setCommands] = useState<Command[]>(() => {
		const commands = localStorage.getItem("ai-commands")
		return commands ? (JSON.parse(commands) as Command[]) : []
	})

	const addCommand = (command: Command) => {
		if (
			commands.find((c) => c.type === command.type && c.label === command.label)
		)
			return
		setCommands([...commands, command])
		localStorage.setItem("ai-commands", JSON.stringify([...commands, command]))
	}

	const removeCommand = (
		type: "cursorCommand" | "selectionCommand",
		label: string,
	) => {
		const newCommand = commands.filter(
			(command) => command.type !== type || command.label !== label,
		)
		setCommands(newCommand)
		localStorage.setItem("ai-commands", JSON.stringify(newCommand))
	}

	return {
		commands,
		addCommand,
		removeCommand,
	}
}
