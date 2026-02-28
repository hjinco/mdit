import { KEYS, PathApi } from "platejs"
import type { PlateEditor } from "platejs/react"

type ExitLinkForwardOptions = {
	allowFromInsideLink?: boolean
	focusEditor?: boolean
	markArrowRightExit?: boolean
}

export function exitLinkForwardAtSelection(
	editor: PlateEditor,
	options: ExitLinkForwardOptions = {},
): boolean {
	const {
		allowFromInsideLink = false,
		focusEditor = false,
		markArrowRightExit = false,
	} = options

	const selection = editor.selection
	if (!selection || !editor.api.isCollapsed()) {
		return false
	}

	const linkType = editor.getType(KEYS.link)
	const linkEntry = editor.api.above({
		at: selection.anchor,
		match: { type: linkType },
	})
	if (!linkEntry) {
		return false
	}

	const [, path] = linkEntry
	if (!editor.api.isEnd(selection.focus, path)) {
		if (!allowFromInsideLink) {
			return false
		}

		const end = editor.api.end(path)
		if (!end) {
			return false
		}

		editor.tf.select({ anchor: end, focus: end })
	}

	const nextPath = PathApi.next(path)
	const nextStart = editor.api.start(nextPath)
	if (nextStart) {
		editor.tf.select({ anchor: nextStart, focus: nextStart })
	} else {
		editor.tf.insertNodes({ text: "" }, { at: nextPath })
		const insertedStart = editor.api.start(nextPath)
		if (insertedStart) {
			editor.tf.select({ anchor: insertedStart, focus: insertedStart })
		}
	}

	if (markArrowRightExit) {
		editor.meta._linkExitedArrowRight = true
	}
	if (focusEditor) {
		editor.tf.focus()
	}

	return true
}
