import { useCallback, useEffect } from "react"
import { closeTabOrHideWindow } from "@/lib/close-tab-or-hide-window"
import {
	useDesktopRuntime,
	useDocumentState,
	useHotkeysState,
	useWindowState,
} from "@/state"

import { installWindowMenu } from "./menu"

export function WindowMenu() {
	const { createAndOpenNote, openFolderPicker, toggleCollectionView } =
		useDesktopRuntime().workspace.commands
	const activeTabId = useDocumentState((s) => s.activeTabId)
	const isEditMode = useWindowState((s) => s.isEditMode)
	const {
		closeActiveTab,
		activatePreviousTab,
		activateNextTab,
		goBack,
		goForward,
	} = useDesktopRuntime().documents.commands

	const handleCloseTab = useCallback(() => {
		void closeTabOrHideWindow({
			isEditMode,
			hasActiveTab: activeTabId !== null,
			closeActiveTab,
		})
	}, [activeTabId, closeActiveTab, isEditMode])

	const {
		toggleFileExplorerOpen: toggleFileExplorer,
		openCommandMenu,
		toggleChatPanelOpen,
		toggleSettingsDialogOpen,
		increaseFontScale: zoomIn,
		decreaseFontScale: zoomOut,
		resetFontScale: resetZoom,
	} = useDesktopRuntime().window.commands
	const chatPanelBetaEnabled = useWindowState((s) => s.chatPanelBetaEnabled)
	const hotkeys = useHotkeysState((s) => s.hotkeys)

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
