import { EditorSurface } from "@mdit/editor/shared"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { save } from "@tauri-apps/plugin-dialog"
import { writeTextFile } from "@tauri-apps/plugin-fs"
import { usePlateEditor } from "platejs/react"
import { useCallback, useEffect } from "react"
import { toast } from "sonner"
import { useLocation } from "wouter"
import { isMac } from "@/utils/platform"
import { EditorKit } from "../editor/plugins/editor-kit"
import { WindowPinButton } from "./window-pin-button"

export function QuickNote() {
	const [, navigate] = useLocation()
	const editor = usePlateEditor({ plugins: EditorKit })

	useEffect(() => {
		editor.tf.focus()
	}, [editor])

	const handleSave = useCallback(async () => {
		const content = editor.api.markdown.serialize()
		if (!content.trim()) {
			return
		}

		const path = await save({
			title: "Save Note",
			defaultPath: "Untitled.md",
			filters: [{ name: "Markdown", extensions: ["md"] }],
		})

		if (!path) {
			return
		}

		try {
			await writeTextFile(path, content)
			navigate(`/edit?path=${encodeURIComponent(path)}`, {
				replace: true,
			})
		} catch (error) {
			console.error("Failed to save file:", error)
			toast.error("Failed to save file")
		}
	}, [editor, navigate])

	useEffect(() => {
		const appWindow = getCurrentWindow()
		const closeListener = appWindow.listen("tauri://close-requested", () => {
			appWindow.destroy()
		})

		return () => {
			closeListener.then((unlisten) => unlisten())
		}
	}, [])

	return (
		<div className="h-screen flex flex-col overflow-hidden bg-background">
			<div
				className="relative h-12 shrink-0 flex items-center justify-end px-2"
				{...(isMac() && { "data-tauri-drag-region": "" })}
			>
				<WindowPinButton />
			</div>
			<div className="flex-1 min-h-0 overflow-hidden">
				<EditorSurface
					editor={editor}
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
