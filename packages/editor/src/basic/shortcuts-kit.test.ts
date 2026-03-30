import { describe, expect, it, vi } from "vitest"
import { insertSoftLineBreak, ShortcutsPlugin } from "./shortcuts-kit"

describe("shortcuts-kit", () => {
	it("maps Shift+Enter to a soft line break", () => {
		const insertSoftBreak = vi.fn()
		const editor = {
			tf: {
				insertSoftBreak,
			},
		} as any

		const shortcut = (ShortcutsPlugin as any).shortcuts.softBreak

		expect(shortcut.keys).toBe("shift+enter")
		expect(shortcut.handler({ editor })).toBe(true)
		expect(insertSoftBreak).toHaveBeenCalledTimes(1)
	})

	it("inserts a soft line break through the editor transform", () => {
		const insertSoftBreak = vi.fn()
		const editor = {
			tf: {
				insertSoftBreak,
			},
		} as any

		insertSoftLineBreak(editor)

		expect(insertSoftBreak).toHaveBeenCalledTimes(1)
	})
})
