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
		isGraphViewDialogOpen,
		toggleGraphViewDialogOpen,
		chatPanelBetaEnabled,
		toggleChatPanelOpen,
		toggleSettingsDialogOpen,
		zoomIn,
		zoomOut,
		resetZoom,
		hotkeys,
	} = useStore(
		useShallow((s) => ({
			toggleFileExplorer: s.toggleFileExplorerOpen,
			openCommandMenu: s.openCommandMenu,
			isGraphViewDialogOpen: s.isGraphViewDialogOpen,
			toggleGraphViewDialogOpen: s.toggleGraphViewDialogOpen,
			chatPanelBetaEnabled: s.chatPanelBetaEnabled,
			toggleChatPanelOpen: s.toggleChatPanelOpen,
			toggleSettingsDialogOpen: s.toggleSettingsDialogOpen,
			zoomIn: s.increaseFontScale,
			zoomOut: s.decreaseFontScale,
			resetZoom: s.resetFontScale,
			hotkeys: s.hotkeys,
		})),
	)

	useEffect(() => {
		installWindowMenu({
			createNote: createAndOpenNote,
			openWorkspace: () => openFolderPicker(),
			toggleFileExplorer,
			toggleCollectionView,
			toggleChatPanel: toggleChatPanelOpen,
			zoomIn,
			zoomOut,
			resetZoom,
			openCommandMenu,
			openGraphView: () => {
				if (!workspacePath && !isGraphViewDialogOpen) {
					return
				}
				toggleGraphViewDialogOpen()
			},
			chatPanelBetaEnabled,
			goBack,
			goForward,
			toggleSettings: toggleSettingsDialogOpen,
			hotkeys,
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
		isGraphViewDialogOpen,
		toggleGraphViewDialogOpen,
		chatPanelBetaEnabled,
		toggleChatPanelOpen,
		goBack,
		goForward,
		toggleSettingsDialogOpen,
		hotkeys,
	])

	return null
}
