import { KEYS, type NodeEntry, PathApi, type TElement } from "platejs"
import type { PlateEditor } from "platejs/react"
import { createSlashInputNode } from "./slash-input"

export const insertSlashMenuBelow = (
	editor: PlateEditor,
	entry: NodeEntry<TElement>,
) => {
	const [node, currentPath] = entry

	if (currentPath.length !== 1) return false

	const listStyleType = (node as { listStyleType?: string }).listStyleType
	const indent = (node as { indent?: number }).indent ?? 1
	const insertPath = PathApi.next(currentPath)
	const blockProps = listStyleType
		? {
				indent,
				listStyleType,
				...(listStyleType === KEYS.listTodo && { checked: false }),
			}
		: {}

	editor.tf.withoutNormalizing(() => {
		editor.tf.insertNodes(
			editor.api.create.block({
				type: editor.getType(KEYS.p) || KEYS.p,
				children: [{ text: "" }],
				...blockProps,
			}),
			{ at: insertPath },
		)

		const start = editor.api.start(insertPath)

		if (!start) return

		editor.tf.select(start)
		editor.tf.insertNodes(
			createSlashInputNode({
				source: "insert-handle",
				type: editor.getType(KEYS.slashInput) ?? KEYS.slashInput,
			}),
			{ at: start },
		)
		editor.tf.focus()
	})

	return true
}
