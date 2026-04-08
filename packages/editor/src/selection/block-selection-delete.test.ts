import { KEYS } from "platejs"
import { describe, expect, it, vi } from "vitest"
import { restoreFocusAfterBlockRemoval } from "./block-selection-delete"

describe("restoreFocusAfterBlockRemoval", () => {
	it("focuses the next block at the deleted position when one exists", () => {
		const focus = vi.fn()
		const insertNodes = vi.fn()
		const select = vi.fn()
		const start = { path: [2, 0], offset: 0 }
		const createBlock = vi.fn()
		const editor: Parameters<typeof restoreFocusAfterBlockRemoval>[0] = {
			api: {
				block: vi.fn().mockReturnValue([{ type: KEYS.p }, [2]]),
				start: vi.fn().mockReturnValue(start),
				create: {
					block: createBlock,
				},
			},
			meta: {},
			tf: {
				focus,
				insertNodes,
				select,
			},
		}

		restoreFocusAfterBlockRemoval(editor, [2])

		expect(editor.api.start).toHaveBeenCalledWith([2])
		expect(select).toHaveBeenCalledWith(start)
		expect(focus).toHaveBeenCalledWith()
		expect(insertNodes).not.toHaveBeenCalled()
		expect(createBlock).not.toHaveBeenCalled()
		expect(editor.meta._forceFocus).toBe(false)
	})

	it("inserts an empty paragraph at the deleted position when nothing remains there", () => {
		const focus = vi.fn()
		const insertNodes = vi.fn()
		const select = vi.fn()
		const start = { path: [3, 0], offset: 0 }
		const paragraph = { type: KEYS.p }
		const createBlock = vi.fn().mockReturnValue(paragraph)
		const editor: Parameters<typeof restoreFocusAfterBlockRemoval>[0] = {
			api: {
				block: vi.fn().mockReturnValue(undefined),
				start: vi.fn().mockReturnValue(start),
				create: {
					block: createBlock,
				},
			},
			meta: {},
			tf: {
				focus,
				insertNodes,
				select,
			},
		}

		restoreFocusAfterBlockRemoval(editor, [3])

		expect(createBlock).toHaveBeenCalledWith({ type: KEYS.p })
		expect(insertNodes).toHaveBeenCalledWith(paragraph, {
			at: [3],
		})
		expect(editor.api.start).toHaveBeenCalledWith([3])
		expect(select).toHaveBeenCalledWith(start)
		expect(focus).toHaveBeenCalledWith()
		expect(editor.meta._forceFocus).toBe(false)
	})
})
