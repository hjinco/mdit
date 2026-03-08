import { KEYS } from "platejs"
import type { PlateEditor } from "platejs/react"

export type ResolvedEditorImageLink = {
	url: string
	embedTarget?: string
}

export function createImageNode(
	editor: PlateEditor,
	image: ResolvedEditorImageLink,
) {
	return {
		type: editor.getType(KEYS.img),
		url: image.url,
		...(image.embedTarget ? { embedTarget: image.embedTarget } : {}),
		children: [{ text: "" }],
	}
}

export function insertResolvedImage(
	editor: PlateEditor,
	image: ResolvedEditorImageLink,
	options?: Parameters<PlateEditor["tf"]["insertNodes"]>[1],
) {
	editor.tf.insertNodes(createImageNode(editor, image), options)
}
