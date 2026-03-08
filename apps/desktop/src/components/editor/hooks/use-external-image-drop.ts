import { insertResolvedImage } from "@mdit/editor/media"
import { extname } from "pathe"
import type { PlateEditor } from "platejs/react"
import { type RefObject, useCallback } from "react"
import { type DropEvent, useDropZone } from "@/contexts/drop-context"
import { isImageFile } from "@/utils/file-icon"
import { prepareImageForEditorInsert } from "../hosts/image-import-host"
import {
	applyDropSelectionFromPoint,
	focusEditorForExternalDropFallback,
} from "./use-external-image-drop.helpers"

function collectNativeDroppedImagePaths(paths: string[]) {
	return paths.filter((path) => {
		const extension = extname(path)
		return extension ? isImageFile(extension) : false
	})
}

export function useExternalImageDrop(
	editor: PlateEditor,
	workspacePath: string | null,
	containerRef: RefObject<HTMLDivElement | null>,
) {
	const handleExternalImageDrop = useCallback(
		async (paths: string[], event: DropEvent) => {
			if (!workspacePath) {
				return
			}

			const imagePaths = collectNativeDroppedImagePaths(paths)
			if (imagePaths.length === 0) {
				return
			}

			const appliedDropSelection = applyDropSelectionFromPoint(
				editor,
				containerRef,
				event.position,
			)
			if (appliedDropSelection) {
				await Promise.resolve()
			} else {
				focusEditorForExternalDropFallback(editor)
			}

			for (const imagePath of imagePaths) {
				const imageData = await prepareImageForEditorInsert(imagePath)
				insertResolvedImage(editor, imageData, { nextBlock: true })
			}

			editor.tf.focus()
		},
		[containerRef, editor, workspacePath],
	)

	const { isOver } = useDropZone({
		id: workspacePath
			? `editor-native-drop:${workspacePath}`
			: "editor-native-drop",
		ref: containerRef,
		path: workspacePath,
		depth: Number.MAX_SAFE_INTEGER,
		onDrop: handleExternalImageDrop,
	})

	return { isExternalDropOver: isOver }
}
