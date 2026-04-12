import { describe, expect, it, vi } from "vitest"
import { restoreSelectionOnEditorActivate } from "./restore-selection-on-activate"

describe("restoreSelectionOnEditorActivate", () => {
	it("restores pending selection and keeps focus behavior delegated", () => {
		const focus = vi.fn()
		const select = vi.fn()
		const restoreHistorySelection = vi.fn()
		const focusEditorAtDefaultSelection = vi.fn()
		const editor = {
			children: [],
			api: {
				isVoid: vi.fn(),
			},
			tf: {
				focus,
				select,
			},
		}

		restoreSelectionOnEditorActivate({
			editor,
			pathDidChange: false,
			pendingRestore: {
				found: true,
				selection: {
					anchor: { path: [0, 0], offset: 0 },
					focus: { path: [0, 0], offset: 4 },
				},
			},
			restoreHistorySelection,
			focusEditorAtDefaultSelection,
		})

		expect(restoreHistorySelection).toHaveBeenCalledOnce()
		expect(focusEditorAtDefaultSelection).not.toHaveBeenCalled()
		expect(focus).not.toHaveBeenCalled()
	})

	it("keeps the current selection when only the backing path changes", () => {
		const restoreHistorySelection = vi.fn()
		const focusEditorAtDefaultSelection = vi.fn()

		restoreSelectionOnEditorActivate({
			editor: {
				children: [],
				api: {
					isVoid: vi.fn(),
				},
				tf: {
					focus: vi.fn(),
					select: vi.fn(),
				},
			},
			pathDidChange: true,
			pendingRestore: {
				found: false,
			},
			restoreHistorySelection,
			focusEditorAtDefaultSelection,
		})

		expect(restoreHistorySelection).not.toHaveBeenCalled()
		expect(focusEditorAtDefaultSelection).not.toHaveBeenCalled()
	})

	it("prepares the default selection without forcing focus on normal note open", () => {
		const focus = vi.fn()
		const select = vi.fn()
		const restoreHistorySelection = vi.fn()
		const focusEditorAtDefaultSelection = vi.fn()

		restoreSelectionOnEditorActivate({
			editor: {
				children: [],
				api: {
					isVoid: vi.fn(),
				},
				tf: {
					focus,
					select,
				},
			},
			pathDidChange: false,
			pendingRestore: {
				found: false,
			},
			restoreHistorySelection,
			focusEditorAtDefaultSelection,
		})

		expect(restoreHistorySelection).not.toHaveBeenCalled()
		expect(focusEditorAtDefaultSelection).toHaveBeenCalledOnce()
		expect(focus).not.toHaveBeenCalled()
	})
})
