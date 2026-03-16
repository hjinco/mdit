import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react"
import { useEditorRef } from "platejs/react"
import type React from "react"
import { useCallback, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useStore } from "@/store"
import { isDndDragEndEvent, isFileEntryDragData } from "./dnd-types"
import {
	EditorBlockDragOverlay,
	isEditorSourceData,
} from "./editor-drag-overlay"
import { handleEditorDrop } from "./editor-drop-handler"
import { EditorDropLine } from "./editor-drop-indicator"
import { isPoint } from "./editor-drop-indicator.helpers"
import { EditorDropOwnershipProvider } from "./editor-drop-ownership"
import { ExplorerDragOverlay } from "./explorer-drag-overlay"
import {
	EMPTY_DRAGGED_EXPLORER_PATHS,
	ExplorerDragPathsProvider,
	getDraggedExplorerPaths,
} from "./explorer-drag-state"
import { handleExplorerDrop } from "./explorer-drop-handler"
import { useEditorDropState } from "./use-editor-drop-state"

type DndProviderProps = {
	children: React.ReactNode
}

type DragStartEvent = Parameters<
	NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragStart"]>
>[0]

type DragMoveEvent = Parameters<
	NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragMove"]>
>[0]

type DragEndEvent = Parameters<
	NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>
>[0]

type DragOverlaySource = {
	data?: unknown
	element?: Element | null
} | null

const DND_SENSORS = [
	PointerSensor.configure({
		activationConstraints: {
			distance: { value: 4 },
		},
	}),
]

function renderDragOverlay(source: DragOverlaySource) {
	if (!source) {
		return null
	}

	if (isFileEntryDragData(source.data) && source.data.name) {
		return (
			<ExplorerDragOverlay
				name={source.data.name}
				isDirectory={Boolean(source.data.isDirectory)}
			/>
		)
	}

	if (isEditorSourceData(source.data) && source.element) {
		return <EditorBlockDragOverlay sourceElement={source.element} />
	}

	return null
}

export function DndProvider({ children }: DndProviderProps) {
	const editor = useEditorRef()
	const [draggedExplorerPaths, setDraggedExplorerPaths] = useState<
		ReadonlySet<string>
	>(EMPTY_DRAGGED_EXPLORER_PATHS)
	const { moveEntry, selectedEntryPaths, resetSelection } = useStore(
		useShallow((state) => ({
			moveEntry: state.moveEntry,
			selectedEntryPaths: state.selectedEntryPaths,
			resetSelection: state.resetSelection,
		})),
	)
	const {
		editorDropIndicator,
		isPointerInEditor,
		startDragging,
		updateDragging,
		completeDragging,
	} = useEditorDropState()

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			setDraggedExplorerPaths(
				getDraggedExplorerPaths(
					event.operation.source?.data,
					selectedEntryPaths,
				),
			)

			const point = isPoint(event.operation.position.current)
				? event.operation.position.current
				: null
			startDragging(point)
		},
		[selectedEntryPaths, startDragging],
	)

	const handleDragMove = useCallback(
		(event: DragMoveEvent) => {
			updateDragging(isPoint(event.to) ? event.to : null)
		},
		[updateDragging],
	)

	const handleDragEnd = useCallback(
		async (rawEvent: DragEndEvent) => {
			setDraggedExplorerPaths(EMPTY_DRAGGED_EXPLORER_PATHS)

			const finalPoint = isPoint(rawEvent.operation.position.current)
				? rawEvent.operation.position.current
				: null
			const { syntheticTarget, isPointerInEditor: wasPointerInEditor } =
				completeDragging(finalPoint)

			if (!isDndDragEndEvent(rawEvent)) {
				return
			}

			const event = rawEvent
			if (event.canceled) {
				return
			}

			const handledByEditorDrop = await handleEditorDrop({
				event,
				editor,
				selectedEntryPaths,
				overrideTargetData: syntheticTarget,
			})
			if (handledByEditorDrop) {
				return
			}

			if (wasPointerInEditor) {
				return
			}

			await handleExplorerDrop({
				event,
				moveEntry,
				selectedEntryPaths,
				resetSelection,
			})
		},
		[completeDragging, editor, moveEntry, resetSelection, selectedEntryPaths],
	)

	return (
		<DragDropProvider
			sensors={DND_SENSORS}
			onDragStart={handleDragStart}
			onDragMove={handleDragMove}
			onDragEnd={handleDragEnd}
		>
			<EditorDropOwnershipProvider isPointerInEditor={isPointerInEditor}>
				<ExplorerDragPathsProvider draggedExplorerPaths={draggedExplorerPaths}>
					{children}
					{editorDropIndicator ? (
						<EditorDropLine indicator={editorDropIndicator} />
					) : null}
					<DragOverlay>{renderDragOverlay}</DragOverlay>
				</ExplorerDragPathsProvider>
			</EditorDropOwnershipProvider>
		</DragDropProvider>
	)
}
