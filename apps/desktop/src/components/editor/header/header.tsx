import { cn } from "@mdit/ui/lib/utils"
import { useShallow } from "zustand/shallow"
import { WindowPinButton } from "@/components/quick-note/window-pin-button"
import { useCurrentWindowLabel } from "@/hooks/use-current-window-label"
import { useIsFullscreen } from "@/hooks/use-is-fullscreen"
import { useStore } from "@/store"
import { isMac } from "@/utils/platform"
import { HistoryNavigation } from "./history-navigation"
import { MoreButton } from "./more-button"
import { Tab } from "./tab"

export function Header() {
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

	return (
		<div
			className={cn(
				"h-12 shrink-0 flex items-center justify-center transition-opacity duration-600 w-[calc(100%-8px)]",
				isFocusMode && "pointer-events-none opacity-0",
			)}
			{...(isMac() && { "data-tauri-drag-region": "" })}
		>
			<div
				className={cn(
					"absolute",
					!isFileExplorerOpen && !isCollectionViewOpen
						? isMac() && !isFullscreen
							? "left-30"
							: "left-12"
						: "left-2",
					!workspacePath && (isMac() && !isFullscreen ? "left-20" : "left-2"),
				)}
			>
				{!isEditMode && <HistoryNavigation />}
			</div>
			<Tab />
			<div className="absolute right-2 flex items-center gap-0.5">
				{showPin && <WindowPinButton />}
				<MoreButton />
			</div>
		</div>
	)
}
