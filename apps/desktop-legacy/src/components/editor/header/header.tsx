import { cn } from "@mdit/ui/lib/utils"
import { useShallow } from "zustand/shallow"
import { WindowPinButton } from "@/components/quick-note/window-pin-button"
import { useCurrentWindowLabel } from "@/hooks/use-current-window-label"
import { useIsFullscreen } from "@/hooks/use-is-fullscreen"
import { useDocumentState, useWindowState, useWorkspaceState } from "@/state"

import { isMac } from "@/utils/platform"
import { HistoryNavigation } from "./history-navigation"
import { InfoButton } from "./info-button"
import { TabStrip } from "./tab"

export function Header({
	hideNavigation = false,
}: {
	hideNavigation?: boolean
}) {
	const { isFileExplorerOpen, isFocusMode, isEditMode } = useWindowState(
		useShallow((s) => ({
			isFileExplorerOpen: s.isFileExplorerOpen,
			isFocusMode: s.isFocusMode,
			isEditMode: s.isEditMode,
		})),
	)
	const { currentCollectionPath, workspacePath } = useWorkspaceState(
		useShallow((s) => ({
			currentCollectionPath: s.currentCollectionPath,
			workspacePath: s.workspacePath,
		})),
	)
	const tabCount = useDocumentState((s) => s.tabs.length)
	const isCollectionViewOpen = currentCollectionPath !== null
	const isFullscreen = useIsFullscreen()
	const windowLabel = useCurrentWindowLabel()
	const showPin =
		windowLabel?.startsWith("edit-") || windowLabel?.startsWith("quick-note-")
	const showEditorNavigation = !hideNavigation && !isEditMode
	const showInfoButton = tabCount > 0

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
				{showInfoButton && <InfoButton />}
			</div>
		</div>
	)
}
