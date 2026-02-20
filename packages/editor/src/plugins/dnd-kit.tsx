import { isType, KEYS } from "platejs"
import { createPlatePlugin, type RenderNodeWrapper } from "platejs/react"
import { Draggable } from "../components/block-draggable"

const UNDRAGGABLE_KEYS = [KEYS.tr, KEYS.td]

const isDraggableEnabled = (props: Parameters<RenderNodeWrapper>[0]) => {
	const { editor, element, path } = props
	if (editor.dom.readOnly) return false
	if (path.length === 1 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
		return true
	}
	if (path.length === 4 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
		const block = editor.api.some({
			at: path,
			match: {
				type: editor.getType(KEYS.table),
			},
		})
		if (block) {
			return true
		}
	}
	return false
}

export const createBlockDraggable = (
	isFocusMode: boolean,
): RenderNodeWrapper => {
	return (props) => {
		if (!isDraggableEnabled(props)) return
		return (draggableProps) => (
			<Draggable {...draggableProps} isFocusMode={isFocusMode} />
		)
	}
}

export const DndPlugin = createPlatePlugin({
	key: "dnd",
})

export const DndKit = [DndPlugin]
