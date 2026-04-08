import { insertResolvedImage, resolveEditorImageLink } from "@mdit/editor/media"
import type { PlateEditor } from "@mdit/editor/plate"
import { extname } from "pathe"
import { type RefObject, useCallback } from "react"
import { desktopImageImportHost } from "@/components/editor/hosts/image-import-runtime"
import { type DropEvent, useDropZone } from "@/contexts/drop-context"
import { isImageFile } from "@/utils/file-icon"
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
	enabled: boolean,
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
				const imageData = await resolveEditorImageLink(
					imagePath,
					desktopImageImportHost,
				)
				if (!imageData) {
					continue
				}

				insertResolvedImage(editor, imageData, { nextBlock: true })
			}

			editor.tf.focus()
		},
		[containerRef, editor, workspacePath],
	)

	const { isOver } = useDropZone({
		id:
			enabled && workspacePath
				? `editor-native-drop:${workspacePath}`
				: "editor-native-drop",
		ref: containerRef,
		path: enabled ? workspacePath : null,
		depth: Number.MAX_SAFE_INTEGER,
		onDrop: handleExternalImageDrop,
	})

	return { isExternalDropOver: isOver }
}
