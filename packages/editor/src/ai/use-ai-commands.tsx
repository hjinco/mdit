import { useState } from "react"
import type { AIMenuCommand, AIMenuStorage } from "./ai-menu.types"

export type Command = AIMenuCommand

export function useAICommands(storage: AIMenuStorage) {
	const [commands, setCommands] = useState<Command[]>(() => {
		try {
			return storage.loadCommands()
		} catch {
			return []
		}
	})

	const addCommand = (command: Command) => {
		setCommands((prevCommands) => {
			if (
				prevCommands.find(
					(c) => c.type === command.type && c.label === command.label,
				)
			)
				return prevCommands
			const nextCommands = [...prevCommands, command]
			storage.saveCommands(nextCommands)
			return nextCommands
		})
	}

	const removeCommand = (
		type: "cursorCommand" | "selectionCommand",
		label: string,
	) => {
		setCommands((prevCommands) => {
			const nextCommands = prevCommands.filter(
				(command) => command.type !== type || command.label !== label,
			)
			storage.saveCommands(nextCommands)
			return nextCommands
		})
	}

	return {
		commands,
		addCommand,
		removeCommand,
	}
}
