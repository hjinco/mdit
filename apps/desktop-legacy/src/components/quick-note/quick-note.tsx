import { NodeApi, usePlateEditor } from "@mdit/editor/plate"
import { EditorSurface } from "@mdit/editor/shared"
import { save } from "@tauri-apps/plugin-dialog"
import { useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { useLocation } from "wouter"
import { useSaveBeforeWindowClose } from "@/hooks/use-save-before-window-close"
import { nativeDocumentFiles } from "@/state/documents/native-files"
import { isMac } from "@/utils/platform"
import { EditorKit } from "../editor/plugins/editor-kit"
import { WindowPinButton } from "./window-pin-button"

export function QuickNote() {
	const [, navigate] = useLocation()
	const isSaving = useRef(false)
	const draftRevision = useRef(0)
	const canClose = useCallback(async () => !isSaving.current, [])
	useSaveBeforeWindowClose(canClose)
	const editor = usePlateEditor({
		chunking: {
			chunkSize: 500,
			contentVisibilityAuto: true,
			query: NodeApi.isEditor,
		},
		plugins: EditorKit,
	})

	useEffect(() => {
		editor.tf.focus()
	}, [editor])

	const handleSave = useCallback(async () => {
		if (isSaving.current || !editor.api.markdown.serialize().trim()) {
			return
		}

		isSaving.current = true
		try {
			const path = await save({
				title: "Save Note",
				defaultPath: "Untitled.md",
				filters: [{ name: "Markdown", extensions: ["md"] }],
			})
			if (!path) {
				return
			}

			const diskDocument = await nativeDocumentFiles.readDocument(path)
			const revision = draftRevision.current
			const content = editor.api.markdown.serialize()
			if (!content.trim()) {
				return
			}

			const result = await nativeDocumentFiles.writeDocument({
				path,
				expectedRevision: diskDocument?.revision ?? null,
				content,
			})
			if (result.status !== "saved") {
				toast.error(
					"The selected file changed. Save again to choose a location.",
				)
				return
			}
			if (draftRevision.current !== revision) {
				toast.info("A copy was saved. Your latest edits are still open.")
				return
			}

			navigate(`/edit?path=${encodeURIComponent(path)}`, {
				replace: true,
			})
		} catch (error) {
			console.error("Failed to save file:", error)
			toast.error("Failed to save file")
		} finally {
			isSaving.current = false
		}
	}, [editor, navigate])

	return (
		<div className="h-screen flex flex-col overflow-hidden bg-background">
			<div
				className="relative h-12 shrink-0 flex items-center justify-end px-2"
				{...(isMac() && { "data-tauri-drag-region": "" })}
			>
				<WindowPinButton />
			</div>
			<div className="flex-1 min-h-0 overflow-auto">
				<EditorSurface
					editor={editor}
					onValueChange={() => {
						draftRevision.current++
					}}
					onKeyDown={(e) => {
						if ((e.metaKey || e.ctrlKey) && e.key === "s") {
							e.preventDefault()
							void handleSave()
						}
					}}
				/>
			</div>
		</div>
	)
}
