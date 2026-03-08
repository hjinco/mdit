import { describe, expect, it, vi } from "vitest"
import { focusEditorForExternalDropFallback } from "./use-external-image-drop.helpers"

describe("external-image-drop-utils", () => {
	it("moves fallback insertion to the end for non-empty documents", () => {
		const focus = vi.fn()
		const select = vi.fn()

		focusEditorForExternalDropFallback({
			children: [{ type: "p", children: [{ text: "Hello" }] }],
			api: {
				isVoid: vi.fn().mockReturnValue(false),
			},
			tf: {
				focus,
				select,
			},
		})

		expect(select).not.toHaveBeenCalled()
		expect(focus).toHaveBeenCalledWith({ edge: "end" })
	})

	it("does not reuse an old selection for empty documents", () => {
		const focus = vi.fn()
		const select = vi.fn()

		focusEditorForExternalDropFallback({
			children: [],
			tf: {
				focus,
				select,
			},
			api: {
				isVoid: vi.fn().mockReturnValue(false),
			},
		})

		expect(select).not.toHaveBeenCalled()
		expect(focus).not.toHaveBeenCalled()
	})
})
