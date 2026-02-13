import { useEffect } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { installWindowMenu } from "./menu"

export function WindowMenu() {
	const {
		createAndOpenNote,
		openFolderPicker,
		workspacePath,
		toggleCollectionView,
		goBack,
		goForward,
	} = useStore(
		useShallow((s) => ({
			createAndOpenNote: s.createAndOpenNote,
			openFolderPicker: s.openFolderPicker,
			workspacePath: s.workspacePath,
			toggleCollectionView: s.toggleCollectionView,
			goBack: s.goBack,
			goForward: s.goForward,
		})),
	)

	const {
		toggleFileExplorer,
		openCommandMenu,
		openGraphViewDialog,
		toggleSettingsDialogOpen,
		zoomIn,
		zoomOut,
		resetZoom,
	} = useStore(
		useShallow((s) => ({
			toggleFileExplorer: s.toggleFileExplorerOpen,
			openCommandMenu: s.openCommandMenu,
			openGraphViewDialog: s.openGraphViewDialog,
			toggleSettingsDialogOpen: s.toggleSettingsDialogOpen,
			zoomIn: s.increaseFontScale,
			zoomOut: s.decreaseFontScale,
			resetZoom: s.resetFontScale,
		})),
	)

	useEffect(() => {
		installWindowMenu({
			createNote: createAndOpenNote,
			openWorkspace: () => openFolderPicker(),
			toggleFileExplorer,
			toggleCollectionView,
			zoomIn,
			zoomOut,
			resetZoom,
			openCommandMenu,
			openGraphView: () => {
				if (!workspacePath) {
					return
				}
				openGraphViewDialog()
			},
			goBack,
			goForward,
			toggleSettings: toggleSettingsDialogOpen,
		})
	}, [
		createAndOpenNote,
		openFolderPicker,
		workspacePath,
		toggleFileExplorer,
		toggleCollectionView,
		zoomIn,
		zoomOut,
		resetZoom,
		openCommandMenu,
		openGraphViewDialog,
		goBack,
		goForward,
		toggleSettingsDialogOpen,
	])

	return null
}
