import { cn } from "@mdit/ui/lib/utils"
import { useShallow } from "zustand/shallow"
import { WindowPinButton } from "@/components/quick-note/window-pin-button"
import { useCurrentWindowLabel } from "@/hooks/use-current-window-label"
import { useIsFullscreen } from "@/hooks/use-is-fullscreen"
import { useStore } from "@/store"
import { isMac } from "@/utils/platform"
import { HistoryNavigation } from "./history-navigation"
import { InfoButton } from "./info-button"
import { TabStrip } from "./tab"

export function Header({
	hideNavigation = false,
}: {
	hideNavigation?: boolean
}) {
	const {
		isFileExplorerOpen,
		isFocusMode,
		currentCollectionPath,
		workspacePath,
		isEditMode,
	} = useStore(
		useShallow((s) => ({
			isFileExplorerOpen: s.isFileExplorerOpen,
			isFocusMode: s.isFocusMode,
			currentCollectionPath: s.currentCollectionPath,
			workspacePath: s.workspacePath,
			isEditMode: s.isEditMode,
		})),
	)
	const isCollectionViewOpen = currentCollectionPath !== null
	const isFullscreen = useIsFullscreen()
	const windowLabel = useCurrentWindowLabel()
	const showPin =
		windowLabel?.startsWith("edit-") || windowLabel?.startsWith("quick-note-")
	const showEditorNavigation = !hideNavigation && !isEditMode

	return (
		<div
			className={cn(
				"relative h-12 shrink-0 flex items-center transition-opacity duration-600 gap-2 pr-2",
				!isFileExplorerOpen && !isCollectionViewOpen
					? isMac() && !isFullscreen
						? "pl-30"
						: "pl-12"
					: "pl-2",
				!workspacePath && (isMac() && !isFullscreen ? "pl-20" : "pl-2"),
				isFocusMode && "pointer-events-none opacity-0",
			)}
			{...(isMac() && { "data-tauri-drag-region": "" })}
		>
			{showEditorNavigation && <HistoryNavigation />}
			{showEditorNavigation && <TabStrip />}
			<div className="flex items-center gap-0.5 ml-auto">
				{showPin && <WindowPinButton />}
				<InfoButton />
			</div>
		</div>
	)
}
