import type { TabHistorySelection } from "@/store/tab/tab-slice"

type SelectionPoint = {
	path: number[]
	offset: number
}

type HistoryRestoreEditor = {
	children: unknown[]
	api: {
		isVoid(element: unknown): boolean
	}
	tf: {
		select(...args: [unknown, ...unknown[]]): void
		focus(): void
	}
}

const isSelectionPoint = (value: unknown): value is SelectionPoint => {
	if (typeof value !== "object" || value === null) {
		return false
	}

	const maybePoint = value as { path?: unknown; offset?: unknown }
	if (
		!Array.isArray(maybePoint.path) ||
		typeof maybePoint.offset !== "number"
	) {
		return false
	}

	return maybePoint.path.every((segment) => typeof segment === "number")
}

export const toTabHistorySelection = (value: unknown): TabHistorySelection => {
	if (typeof value !== "object" || value === null) {
		return null
	}

	const maybeRange = value as { anchor?: unknown; focus?: unknown }
	if (
		!isSelectionPoint(maybeRange.anchor) ||
		!isSelectionPoint(maybeRange.focus)
	) {
		return null
	}

	return {
		anchor: {
			path: [...maybeRange.anchor.path],
			offset: maybeRange.anchor.offset,
		},
		focus: {
			path: [...maybeRange.focus.path],
			offset: maybeRange.focus.offset,
		},
	}
}

export function focusEditorAtDefaultSelection(
	editor: HistoryRestoreEditor,
): void {
	const targetIndex = editor.children.findIndex(
		(element) => element && !editor.api.isVoid(element),
	)
	const finalIndex = targetIndex === -1 ? 0 : targetIndex

	if (editor.children.length > 0) {
		editor.tf.select([finalIndex], { edge: "start" })
	}
}

export function restoreHistorySelection(
	editor: HistoryRestoreEditor,
	selection: TabHistorySelection,
): void {
	if (!selection) {
		editor.tf.focus()
		return
	}

	try {
		editor.tf.select({
			anchor: selection.anchor,
			focus: selection.focus,
		})
	} catch {
		focusEditorAtDefaultSelection(editor)
	} finally {
		editor.tf.focus()
	}
}
