import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react"
import { useEditorRef } from "@mdit/editor/plate"
import type React from "react"
import { useCallback, useEffect, useState } from "react"
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
import { computeExplorerDropTarget } from "./explorer-drop-target.helpers"
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
	const [hoveredExplorerDropPath, setHoveredExplorerDropPath] = useState<
		string | null
	>(null)
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
			setHoveredExplorerDropPath(
				point ? computeExplorerDropTarget(point) : null,
			)
			startDragging(point)
		},
		[selectedEntryPaths, startDragging],
	)

	const handleDragMove = useCallback(
		(event: DragMoveEvent) => {
			setHoveredExplorerDropPath(
				isPoint(event.to) ? computeExplorerDropTarget(event.to) : null,
			)
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
			const syntheticExplorerTarget = finalPoint
				? computeExplorerDropTarget(finalPoint)
				: null
			setHoveredExplorerDropPath(null)

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
				overrideTargetPath: syntheticExplorerTarget,
			})
		},
		[completeDragging, editor, moveEntry, resetSelection, selectedEntryPaths],
	)

	useEffect(() => {
		const finishDropAnimations = (element: Element) => {
			for (const animation of element.getAnimations()) {
				animation.finish()
			}
		}

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type !== "attributes") {
					continue
				}

				const target = mutation.target
				if (!(target instanceof Element)) {
					continue
				}

				if (!target.hasAttribute("data-dnd-dropping")) {
					continue
				}

				finishDropAnimations(target)
			}
		})

		observer.observe(document.body, {
			subtree: true,
			attributes: true,
			attributeFilter: ["data-dnd-dropping"],
		})

		return () => observer.disconnect()
	}, [])

	return (
		<DragDropProvider
			sensors={DND_SENSORS}
			onDragStart={handleDragStart}
			onDragMove={handleDragMove}
			onDragEnd={handleDragEnd}
		>
			<EditorDropOwnershipProvider isPointerInEditor={isPointerInEditor}>
				<ExplorerDragPathsProvider
					draggedExplorerPaths={draggedExplorerPaths}
					hoveredExplorerDropPath={hoveredExplorerDropPath}
				>
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
