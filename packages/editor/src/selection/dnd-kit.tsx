import { isType, KEYS } from "platejs"
import { createPlatePlugin, type RenderNodeWrapper } from "platejs/react"
import { Draggable } from "../selection/block-draggable"

const UNDRAGGABLE_KEYS = [KEYS.tr, KEYS.td]

const isDraggableEnabled = (props: Parameters<RenderNodeWrapper>[0]) => {
	const { editor, element, path } = props
	if (editor.dom.readOnly) return false
	return path.length === 1 && !isType(editor, element, UNDRAGGABLE_KEYS)
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
