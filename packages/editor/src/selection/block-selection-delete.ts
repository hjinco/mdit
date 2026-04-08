import { KEYS, type Path } from "platejs"

type BlockRemovalFocusEditor = {
	api: {
		block(options: { at: Path }): [unknown, Path] | undefined
		start(path: Path): unknown
		create: {
			block(options: { type: string }): unknown
		}
	}
	meta: Record<string, unknown> & {
		_forceFocus?: boolean
	}
	tf: {
		focus(options?: { at?: Path; edge?: "start" | "end" }): void
		insertNodes(node: unknown, options: { at: Path }): void
		select(target: unknown): void
	}
}

export function restoreFocusAfterBlockRemoval(
	editor: BlockRemovalFocusEditor,
	removedPath: Path,
): void {
	editor.meta._forceFocus = true

	try {
		const nextEntry = editor.api.block({ at: removedPath })
		if (nextEntry) {
			const start = editor.api.start(nextEntry[1])
			editor.tf.select(start)
			editor.tf.focus()
			return
		}

		editor.tf.insertNodes(editor.api.create.block({ type: KEYS.p }), {
			at: removedPath,
		})
		editor.tf.select(editor.api.start(removedPath))
		editor.tf.focus()
	} finally {
		editor.meta._forceFocus = false
	}
}
