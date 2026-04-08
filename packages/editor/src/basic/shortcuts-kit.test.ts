import { beforeEach, describe, expect, it, vi } from "vitest"
import { NOTE_TITLE_KEY } from "../title"
import {
	copySelection,
	cutSelection,
	insertSoftLineBreak,
	ShortcutsPlugin,
} from "./shortcuts-kit"

describe("shortcuts-kit", () => {
	let insertSoftBreak: ReturnType<typeof vi.fn>
	let deleteFragment: ReturnType<typeof vi.fn>
	let replaceNodes: ReturnType<typeof vi.fn>
	let editor: any
	let clipboardWriteText: ReturnType<typeof vi.fn>

	beforeEach(() => {
		insertSoftBreak = vi.fn()
		deleteFragment = vi.fn()
		replaceNodes = vi.fn()
		clipboardWriteText = vi.fn().mockResolvedValue(undefined)
		Object.defineProperty(globalThis, "navigator", {
			value: {
				clipboard: {
					writeText: clipboardWriteText,
				},
			},
			configurable: true,
		})
		editor = {
			selection: {
				anchor: { path: [0, 0], offset: 0 },
				focus: { path: [0, 0], offset: 0 },
			},
			api: {
				above: vi.fn(),
				isBlock: vi.fn(),
				string: vi.fn(),
			},
			tf: {
				deleteFragment,
				insertSoftBreak,
				replaceNodes,
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

	it("copies title text as plain text instead of serializing the title block", () => {
		editor.api.above.mockReturnValue([{ type: NOTE_TITLE_KEY }, [0]])
		editor.api.string.mockReturnValue("My Title")

		copySelection(editor)

		expect(clipboardWriteText).toHaveBeenCalledWith("My Title")
	})

	it("cuts a collapsed title selection by clearing the title text", () => {
		editor.api.above.mockReturnValue([{ type: NOTE_TITLE_KEY }, [0]])
		editor.api.string.mockReturnValue("My Title")

		cutSelection(editor)

		expect(clipboardWriteText).toHaveBeenCalledWith("My Title")
		expect(replaceNodes).toHaveBeenCalledWith(
			{ type: NOTE_TITLE_KEY, children: [{ text: "" }] },
			{ at: [0] },
		)
		expect(deleteFragment).not.toHaveBeenCalled()
	})

	it("cuts an expanded title selection with fragment deletion", () => {
		editor.selection = {
			anchor: { path: [0, 0], offset: 0 },
			focus: { path: [0, 0], offset: 4 },
		}
		editor.api.above.mockReturnValue([{ type: NOTE_TITLE_KEY }, [0]])
		editor.api.string.mockReturnValue("My T")

		cutSelection(editor)

		expect(clipboardWriteText).toHaveBeenCalledWith("My T")
		expect(deleteFragment).toHaveBeenCalledTimes(1)
		expect(replaceNodes).not.toHaveBeenCalled()
	})
})
