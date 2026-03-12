import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react"
import { useEditorRef } from "platejs/react"
import type React from "react"
import { useCallback, useLayoutEffect, useRef } from "react"
import { useShallow } from "zustand/react/shallow"
import { useStore } from "@/store"
import { isDndDragEndEvent, isEditorDragData } from "./dnd-types"
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

const EDITOR_OVERLAY_CLEANUP_SELECTOR =
	"[data-editor-drop-zone], [data-editor-drop-line]"

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function isEditorSourceData(data: unknown): data is {
	kind: "editor"
	id?: string
} {
	return isRecord(data) && data.kind === "editor" && isEditorDragData(data)
}

function buildEditorOverlayClone(sourceElement: Element): HTMLElement | null {
	const sourceRoot =
		sourceElement.closest("[data-editor-draggable-root]") ?? sourceElement
	const cloned = sourceRoot.cloneNode(true)
	if (!(cloned instanceof HTMLElement)) {
		return null
	}

	cloned.classList.remove("opacity-30")
	cloned.classList.add("pointer-events-none", "opacity-50")
	cloned.querySelectorAll(EDITOR_OVERLAY_CLEANUP_SELECTOR).forEach((node) => {
		node.remove()
	})

	return cloned
}

function EditorBlockDragOverlay({ sourceElement }: { sourceElement: Element }) {
	const containerRef = useRef<HTMLDivElement | null>(null)

	useLayoutEffect(() => {
		const container = containerRef.current
		if (!container) return

		const cloned = buildEditorOverlayClone(sourceElement)
		if (!cloned) {
			container.replaceChildren()
			return
		}

		container.replaceChildren(cloned)

		return () => {
			container.replaceChildren()
		}
	}, [sourceElement])

	return (
		<div
			ref={containerRef}
			className="pointer-events-none max-w-[min(80vw,800px)]"
			aria-hidden
		/>
	)
}

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

			const handledByEditorDrop = await handleEditorDrop({
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
				{(source) => {
					if (!source || !isEditorSourceData(source.data) || !source.element) {
						return null
					}

					return <EditorBlockDragOverlay sourceElement={source.element} />
				}}
			</DragOverlay>
		</DragDropProvider>
	)
}
