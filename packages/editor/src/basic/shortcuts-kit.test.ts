import { beforeEach, describe, expect, it, vi } from "vitest"
import { insertSoftLineBreak, ShortcutsPlugin } from "./shortcuts-kit"

describe("shortcuts-kit", () => {
	let insertSoftBreak: ReturnType<typeof vi.fn>
	let editor: any

	beforeEach(() => {
		insertSoftBreak = vi.fn()
		editor = {
			tf: {
				insertSoftBreak,
			},
		} as any
	})

	it("maps Shift+Enter to a soft line break", () => {
		const shortcut = (ShortcutsPlugin as any).shortcuts.softBreak

		expect(shortcut.keys).toBe("shift+enter")
		expect(shortcut.handler({ editor })).toBe(true)
		expect(insertSoftBreak).toHaveBeenCalledTimes(1)
	})

	it("inserts a soft line break through the editor transform", () => {
		insertSoftLineBreak(editor)

		expect(insertSoftBreak).toHaveBeenCalledTimes(1)
	})
})
