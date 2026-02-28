import { useState } from "react"
import type { AIMenuStorage } from "./ai-menu.types"

export function useHiddenDefaultSelectionCommands(storage: AIMenuStorage) {
	const [hiddenDefaultValues, setHiddenDefaultValues] = useState<string[]>(
		() => {
			try {
				return storage.loadHiddenDefaultSelectionCommands()
			} catch {
				return []
			}
		},
	)

	const hideDefaultCommand = (value: string) => {
		setHiddenDefaultValues((prev) => {
			if (prev.includes(value)) return prev
			const next = [...prev, value]
			storage.saveHiddenDefaultSelectionCommands(next)
			return next
		})
	}

	return {
		hiddenDefaultValues,
		hideDefaultCommand,
	}
}
