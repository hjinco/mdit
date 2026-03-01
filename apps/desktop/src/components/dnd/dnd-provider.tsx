import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react"
import { useEditorRef } from "platejs/react"
import type React from "react"
import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { useStore } from "@/store"
import { isDndDragEndEvent } from "./dnd-types"
import { handleEditorDrop } from "./editor-drop-handler"
import { handleExplorerDrop } from "./explorer-drop-handler"

type DndProviderProps = {
	children: React.ReactNode
}

const DND_SENSORS = [
	PointerSensor.configure({
		activationConstraints: {
			distance: { value: 4 },
		},
	}),
]

export function DndProvider({ children }: DndProviderProps) {
	const editor = useEditorRef()
	const { moveEntry, selectedEntryPaths, resetSelection } = useStore(
		useShallow((state) => ({
			moveEntry: state.moveEntry,
			selectedEntryPaths: state.selectedEntryPaths,
			resetSelection: state.resetSelection,
		})),
	)

	const handleDragEnd = useCallback(
		async (rawEvent: unknown) => {
			if (!isDndDragEndEvent(rawEvent)) {
				return
			}

			const event = rawEvent
			if (event.canceled) {
				return
			}

			const handledByEditorDrop = handleEditorDrop({
				event,
				editor,
				selectedEntryPaths,
			})
			if (handledByEditorDrop) {
				return
			}

			await handleExplorerDrop({
				event,
				moveEntry,
				selectedEntryPaths,
				resetSelection,
			})
		},
		[editor, moveEntry, selectedEntryPaths, resetSelection],
	)

	return (
		<DragDropProvider sensors={DND_SENSORS} onDragEnd={handleDragEnd}>
			{children}
			<DragOverlay>
				<div />
			</DragOverlay>
		</DragDropProvider>
	)
}
