import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/shallow"
import { closeTabOrHideWindow } from "@/lib/close-tab-or-hide-window"
import { useStore } from "@/store"
import { installWindowMenu } from "./menu"

export function WindowMenu() {
	const {
		createAndOpenNote,
		activeTabId,
		isEditMode,
		closeActiveTab,
		openFolderPicker,
		activatePreviousTab,
		activateNextTab,
		toggleCollectionView,
		goBack,
		goForward,
	} = useStore(
		useShallow((s) => ({
			createAndOpenNote: s.createAndOpenNote,
			activeTabId: s.activeTabId,
			isEditMode: s.isEditMode,
			closeActiveTab: s.closeActiveTab,
			openFolderPicker: s.openFolderPicker,
			activatePreviousTab: s.activatePreviousTab,
			activateNextTab: s.activateNextTab,
			toggleCollectionView: s.toggleCollectionView,
			goBack: s.goBack,
			goForward: s.goForward,
		})),
	)

	const handleCloseTab = useCallback(() => {
		void closeTabOrHideWindow({
			isEditMode,
			hasActiveTab: activeTabId !== null,
			closeActiveTab,
		})
	}, [activeTabId, closeActiveTab, isEditMode])

	const {
		toggleFileExplorer,
		openCommandMenu,
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
			closeTabOrHideWindow: handleCloseTab,
			openWorkspace: () => openFolderPicker(),
			activatePreviousTab,
			activateNextTab,
			toggleFileExplorer,
			toggleCollectionView,
			toggleChatPanel: toggleChatPanelOpen,
			zoomIn,
			zoomOut,
			resetZoom,
			openCommandMenu,
			chatPanelBetaEnabled,
			goBack,
			goForward,
			toggleSettings: toggleSettingsDialogOpen,
			hotkeys,
		})
	}, [
		createAndOpenNote,
		handleCloseTab,
		openFolderPicker,
		activatePreviousTab,
		activateNextTab,
		toggleFileExplorer,
		toggleCollectionView,
		zoomIn,
		zoomOut,
		resetZoom,
		openCommandMenu,
		chatPanelBetaEnabled,
		toggleChatPanelOpen,
		goBack,
		goForward,
		toggleSettingsDialogOpen,
		hotkeys,
	])

	return null
}
