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

	const nextStart = editor.api.start(path, { next: true })
	if (nextStart) {
		editor.tf.select({ anchor: nextStart, focus: nextStart })
	} else {
		const nextPath = PathApi.next(path)
		editor.tf.insertNodes({ text: "" }, { at: nextPath })
		editor.tf.select(nextPath)
	}

	if (markArrowRightExit) {
		editor.meta._linkExitedArrowRight = true
	}
	if (focusEditor) {
		editor.tf.focus()
	}

	return true
}
