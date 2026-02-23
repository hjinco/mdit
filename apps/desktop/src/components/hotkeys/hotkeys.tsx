import { useHotkey } from "@tanstack/react-hotkeys"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

export function Hotkeys() {
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
		toggleSettingsDialogOpen,
		zoomIn,
		zoomOut,
		resetZoom,
	} = useStore(
		useShallow((s) => ({
			toggleFileExplorer: s.toggleFileExplorerOpen,
			openCommandMenu: s.openCommandMenu,
			isGraphViewDialogOpen: s.isGraphViewDialogOpen,
			toggleGraphViewDialogOpen: s.toggleGraphViewDialogOpen,
			toggleSettingsDialogOpen: s.toggleSettingsDialogOpen,
			zoomIn: s.increaseFontScale,
			zoomOut: s.decreaseFontScale,
			resetZoom: s.resetFontScale,
		})),
	)

	// File
	useHotkey("Mod+N", () => createAndOpenNote(), { preventDefault: true })
	useHotkey("Mod+O", () => openFolderPicker(), { preventDefault: true })

	// View
	useHotkey("Mod+K", () => openCommandMenu(), { preventDefault: true })
	useHotkey(
		"Mod+G",
		() => {
			if (!workspacePath && !isGraphViewDialogOpen) return
			toggleGraphViewDialogOpen()
		},
		{ preventDefault: true },
	)
	useHotkey("Mod+S", () => toggleFileExplorer(), { preventDefault: true })
	useHotkey("Mod+D", () => toggleCollectionView(), { preventDefault: true })
	useHotkey("Mod+=", () => zoomIn(), { preventDefault: true })
	useHotkey("Mod+-", () => zoomOut(), { preventDefault: true })
	useHotkey("Mod+0", () => resetZoom(), { preventDefault: true })

	// History
	useHotkey("Mod+[", () => goBack(), { preventDefault: true })
	useHotkey("Mod+]", () => goForward(), { preventDefault: true })

	// App
	useHotkey("Mod+/", () => toggleSettingsDialogOpen(), { preventDefault: true })

	return null
}
