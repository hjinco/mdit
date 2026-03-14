import { useLayoutEffect, useRef } from "react"
import { isEditorDragData } from "./dnd-types"

const EDITOR_OVERLAY_CLEANUP_SELECTOR =
	"[data-editor-drop-zone], [data-editor-drop-line]"
const EDITOR_BLOCK_SELECTOR = "[data-editor-block-id]"

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

export function isEditorSourceData(data: unknown): data is {
	kind: "editor"
	id?: string
} {
	return isRecord(data) && data.kind === "editor" && isEditorDragData(data)
}

function clearEditorOverlayAttributes(root: HTMLElement) {
	root.removeAttribute("data-editor-block-id")
	root.removeAttribute("data-editor-draggable-root")
	root.querySelectorAll<HTMLElement>(EDITOR_BLOCK_SELECTOR).forEach((node) => {
		node.removeAttribute("data-editor-block-id")
	})
	root
		.querySelectorAll<HTMLElement>("[data-editor-draggable-root]")
		.forEach((node) => {
			node.removeAttribute("data-editor-draggable-root")
		})
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
	clearEditorOverlayAttributes(cloned)
	cloned.querySelectorAll(EDITOR_OVERLAY_CLEANUP_SELECTOR).forEach((node) => {
		node.remove()
	})

	return cloned
}

export function EditorBlockDragOverlay({
	sourceElement,
}: {
	sourceElement: Element
}) {
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
