import { useEffect } from "react"
import { useFontScale } from "@/hooks/use-font-scale"
import { useStore } from "@/store"
import { Editor } from "../editor/editor"
import { SettingsDialog } from "../settings/settings"

export function EditNote({ filePath }: { filePath: string }) {
	useFontScale()
	const setIsEditMode = useStore((s) => s.setIsEditMode)
	const openTab = useStore((s) => s.openTab)

	useEffect(() => {
		setIsEditMode(true)
		openTab(filePath)
	}, [setIsEditMode, filePath, openTab])

	return (
		<>
			<div className="h-screen flex flex-col bg-muted">
				<div className="flex-1 flex overflow-hidden">
					<Editor destroyOnClose />
				</div>
			</div>
			<SettingsDialog />
		</>
	)
}
