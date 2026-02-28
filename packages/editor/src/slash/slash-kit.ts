import { SlashInputPlugin, SlashPlugin } from "@platejs/slash-command/react"
import { KEYS } from "platejs"
import { createSlashInputElement } from "../slash/node-slash"
import type { SlashHostDeps } from "./slash-kit-types"

export type { SlashHostDeps } from "./slash-kit-types"

type CreateSlashKitOptions = {
	host?: SlashHostDeps
}

export const createSlashKit = ({ host }: CreateSlashKitOptions = {}) => [
	SlashPlugin.configure({
		options: {
			triggerQuery: (editor) => {
				// Don't trigger in code blocks
				if (
					editor.api.some({
						match: { type: editor.getType(KEYS.codeBlock) },
					})
				) {
					return false
				}

				// Get current block node
				const entry = editor.api.above({
					match: editor.api.isBlock,
					mode: "highest",
				})

				if (!entry) {
					return false
				}

				const [node] = entry

				// Only trigger in paragraph blocks
				return node.type === editor.getType(KEYS.p)
			},
		},
	}),
	SlashInputPlugin.withComponent(createSlashInputElement(host)),
]
