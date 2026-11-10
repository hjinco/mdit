import { validateHotkey } from "@tanstack/react-hotkeys"
import { createState } from "../create-state"
import {
	type AppHotkeyActionId,
	type AppHotkeyMap,
	createDefaultAppHotkeys,
	findHotkeyConflict,
	isReservedAppHotkeyBinding,
	normalizeHotkeyBinding,
} from "./hotkey-bindings"
import { createSerialQueue } from "./serial-queue"

export * from "./hotkey-bindings"

export type HotkeyStorage = {
	load: () => Promise<AppHotkeyMap | null>
	save: (bindings: AppHotkeyMap) => Promise<void>
	reset: () => Promise<void>
}

export type SetHotkeyBindingResult = {
	success: boolean
	conflictWith?: AppHotkeyActionId
	error?: string
}

export type HotkeysSnapshot = {
	hotkeys: AppHotkeyMap
	isHotkeysLoaded: boolean
}

export const createHotkeysService = ({
	storage,
}: {
	storage: HotkeyStorage
}) => {
	const state = createState<HotkeysSnapshot>({
		hotkeys: createDefaultAppHotkeys(),
		isHotkeysLoaded: false,
	})
	const enqueue = createSerialQueue()

	const load = async () => {
		let hotkeys: AppHotkeyMap | null = null
		try {
			hotkeys = await storage.load()
		} catch (error) {
			console.error("Failed to load hotkeys:", error)
		}
		state.update({
			hotkeys: hotkeys ?? createDefaultAppHotkeys(),
			isHotkeysLoaded: true,
		})
	}

	const setHotkeyBinding = (
		actionId: AppHotkeyActionId,
		combo: string,
	): Promise<SetHotkeyBindingResult> =>
		enqueue(async () => {
			const binding = normalizeHotkeyBinding(combo)
			if (binding) {
				const validation = validateHotkey(binding)
				if (!validation.valid) {
					const invalidPart = validation.errors[0]?.part
					return {
						success: false,
						error: invalidPart
							? `Invalid hotkey part: ${invalidPart}`
							: "Invalid hotkey format",
					}
				}
				if (isReservedAppHotkeyBinding(binding)) {
					return {
						success: false,
						error: "Shortcut is reserved for tab switching",
					}
				}
			}

			if (!state.getSnapshot().isHotkeysLoaded) {
				await load()
			}
			const { hotkeys } = state.getSnapshot()
			const conflictWith = findHotkeyConflict(hotkeys, actionId, binding)
			if (conflictWith) {
				return {
					success: false,
					conflictWith,
					error: "Shortcut already assigned",
				}
			}

			const next = { ...hotkeys, [actionId]: binding }
			try {
				await storage.save(next)
				state.update({ hotkeys: next })
				return { success: true }
			} catch (error) {
				console.error("Failed to save hotkey binding:", error)
				return {
					success: false,
					error:
						error instanceof Error
							? error.message
							: "Failed to save hotkey binding",
				}
			}
		})

	const resetHotkeyBindings = () =>
		enqueue(async () => {
			try {
				await storage.reset()
				state.update({
					hotkeys: createDefaultAppHotkeys(),
					isHotkeysLoaded: true,
				})
			} catch (error) {
				console.error("Failed to reset hotkeys:", error)
			}
		})

	return {
		getSnapshot: state.getSnapshot,
		subscribe: state.subscribe,
		commands: {
			loadHotkeys: () => enqueue(load),
			setHotkeyBinding,
			resetHotkeyBindings,
		},
	}
}
