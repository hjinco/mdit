import type { PlateEditor } from "@mdit/editor/plate"
import type { RefObject } from "react"
import type { DropEvent } from "@/contexts/drop-context"
import { focusEditorAtDefaultSelection } from "../utils/history-restore-utils"

type DocumentWithCaretApi = Document & {
	caretRangeFromPoint?: (x: number, y: number) => Range | null
	caretPositionFromPoint?: (
		x: number,
		y: number,
	) => { offsetNode: Node; offset: number } | null
}

type DropFallbackEditor = {
	children: unknown[]
	api: {
		isVoid(element: unknown): boolean
	}
	tf: {
		select(...args: [unknown, ...unknown[]]): void
		focus(...args: unknown[]): void
	}
}

export function applyDropSelectionFromPoint(
	editor: PlateEditor,
	containerRef: RefObject<HTMLDivElement | null>,
	position: DropEvent["position"],
) {
	const container = containerRef.current
	if (!container) {
		return false
	}

	const documentWithCaretApi = container.ownerDocument as DocumentWithCaretApi

	let domRange: Range | null = null
	if (documentWithCaretApi.caretRangeFromPoint) {
		domRange = documentWithCaretApi.caretRangeFromPoint(position.x, position.y)
	} else if (documentWithCaretApi.caretPositionFromPoint) {
		const domPoint = documentWithCaretApi.caretPositionFromPoint(
			position.x,
			position.y,
		)
		if (domPoint) {
			domRange = container.ownerDocument.createRange()
			domRange.setStart(domPoint.offsetNode, domPoint.offset)
			domRange.collapse(true)
		}
	}

	if (!domRange || !container.contains(domRange.startContainer)) {
		return false
	}

	const selection = container.ownerDocument.getSelection()
	if (!selection) {
		return false
	}

	selection.removeAllRanges()
	selection.addRange(domRange)
	editor.tf.focus()
	return true
}

export function focusEditorForExternalDropFallback(editor: DropFallbackEditor) {
	if (editor.children.length === 0) {
		focusEditorAtDefaultSelection(editor)
		return
	}

	editor.tf.focus({ edge: "end" })
}
