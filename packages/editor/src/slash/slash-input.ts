import { KEYS, type TComboboxInputElement } from "platejs"

export type SlashInputSource = "slash-trigger" | "insert-handle"

export type SlashInputElement = TComboboxInputElement & {
	source?: SlashInputSource
}

export type SlashInputCancelCause =
	| "arrowLeft"
	| "arrowRight"
	| "backspace"
	| "blur"
	| "deselect"
	| "escape"
	| "manual"

export type SlashInputCancelBehavior = {
	move?: "left" | "right"
	restoreText: string | null
}

export const createSlashInputNode = ({
	source = "slash-trigger",
	type = KEYS.slashInput,
}: {
	source?: SlashInputSource
	type?: string
} = {}): SlashInputElement => ({
	type,
	value: "",
	children: [{ text: "" }],
	source,
})

export const getSlashInputCancelBehavior = ({
	cause,
	source,
	trigger,
	value,
}: {
	cause: SlashInputCancelCause
	source?: SlashInputSource
	trigger: string
	value: string
}): SlashInputCancelBehavior => {
	const move =
		cause === "arrowLeft"
			? "left"
			: cause === "arrowRight"
				? "right"
				: undefined

	if (source === "insert-handle") {
		return {
			move,
			restoreText: cause === "backspace" ? null : value,
		}
	}

	return {
		move,
		restoreText: cause === "backspace" ? null : `${trigger}${value}`,
	}
}
