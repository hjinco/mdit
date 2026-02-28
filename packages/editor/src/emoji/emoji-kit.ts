import emojiMartData, { type EmojiMartData } from "@emoji-mart/data"
import { EmojiInputPlugin, EmojiPlugin } from "@platejs/emoji/react"
import { KEYS } from "platejs"

import { EmojiInputElement } from "../emoji/node-emoji"

export const EmojiKit = [
	EmojiPlugin.configure({
		options: {
			data: emojiMartData as EmojiMartData,
			triggerQuery(editor) {
				// Don't trigger in code blocks
				if (
					editor.api.some({
						match: { type: editor.getType(KEYS.codeBlock) },
					})
				) {
					return false
				}
				return true
			},
		},
	}),
	EmojiInputPlugin.withComponent(EmojiInputElement),
]
