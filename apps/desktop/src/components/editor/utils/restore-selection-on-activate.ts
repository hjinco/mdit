import type { PendingHistorySelectionRestoreResult } from "@/store"

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

type RestoreSelectionOnEditorActivateOptions = {
	editor: HistoryRestoreEditor
	pathDidChange: boolean
	pendingRestore: PendingHistorySelectionRestoreResult
	restoreHistorySelection: typeof import("./history-restore-utils").restoreHistorySelection
	focusEditorAtDefaultSelection: typeof import("./history-restore-utils").focusEditorAtDefaultSelection
}

export function restoreSelectionOnEditorActivate({
	editor,
	pathDidChange,
	pendingRestore,
	restoreHistorySelection,
	focusEditorAtDefaultSelection,
}: RestoreSelectionOnEditorActivateOptions): void {
	if (pendingRestore.found) {
		restoreHistorySelection(editor, pendingRestore.selection)
		return
	}

	// Keep the current selection when only the backing file path changes.
	if (pathDidChange) {
		return
	}

	focusEditorAtDefaultSelection(editor)
}
