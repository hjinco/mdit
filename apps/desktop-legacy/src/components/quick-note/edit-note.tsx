import { useEffect } from "react"
import { toast } from "sonner"
import { useFontScale } from "@/hooks/use-font-scale"
import { useSaveBeforeWindowClose } from "@/hooks/use-save-before-window-close"
import { useDesktopRuntime } from "@/state"
import { Editor } from "../editor/editor"
import { SettingsDialog } from "../settings"

export function EditNote({ filePath }: { filePath: string }) {
	useFontScale()
	const { openTab, flushAllDocuments } = useDesktopRuntime().documents.commands
	useSaveBeforeWindowClose(flushAllDocuments)

	useEffect(() => {
		if (filePath) {
			void openTab(filePath).catch((error) => {
				console.error("Failed to open note:", error)
				toast.error("Failed to open the note.")
			})
		}
	}, [filePath, openTab])

	return (
		<>
			<div className="h-screen flex flex-col bg-muted">
				<div className="flex-1 flex overflow-hidden">
					<Editor hideNavigation />
				</div>
			</div>
			<SettingsDialog />
		</>
	)
}
