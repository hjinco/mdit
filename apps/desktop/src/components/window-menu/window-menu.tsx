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
		workspacePath,
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
			workspacePath: s.workspacePath,
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
		handleCloseTab,
		openFolderPicker,
		activatePreviousTab,
		activateNextTab,
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
