import { useHotkey } from "@tanstack/react-hotkeys"
import { useEffect, useMemo } from "react"
import { useShallow } from "zustand/shallow"
import { APP_HOTKEY_DEFINITIONS, type AppHotkeyActionId } from "@/lib/hotkeys"
import { useStore } from "@/store"

const HOTKEY_OPTIONS = { preventDefault: true } as const

type HotkeyBindingProps = {
	binding: string
	onTrigger: () => void
}

function HotkeyBinding({ binding, onTrigger }: HotkeyBindingProps) {
	useHotkey(
		binding as Parameters<typeof useHotkey>[0],
		() => onTrigger(),
		HOTKEY_OPTIONS,
	)
	return null
}

export function Hotkeys() {
	const {
		hotkeys,
		isHotkeysLoaded,
		initializeHotkeys,
		createAndOpenNote,
		openFolderPicker,
		workspacePath,
		toggleCollectionView,
		goBack,
		goForward,
		toggleFileExplorer,
		toggleCommandMenu,
		isGraphViewDialogOpen,
		toggleGraphViewDialogOpen,
		toggleSettingsDialogOpen,
		toggleNoteInfoOpen,
		zoomIn,
		zoomOut,
		resetZoom,
	} = useStore(
		useShallow((s) => ({
			hotkeys: s.hotkeys,
			isHotkeysLoaded: s.isHotkeysLoaded,
			initializeHotkeys: s.initializeHotkeys,
			createAndOpenNote: s.createAndOpenNote,
			openFolderPicker: s.openFolderPicker,
			workspacePath: s.workspacePath,
			toggleCollectionView: s.toggleCollectionView,
			goBack: s.goBack,
			goForward: s.goForward,
			toggleFileExplorer: s.toggleFileExplorerOpen,
			toggleCommandMenu: s.toggleCommandMenu,
			isGraphViewDialogOpen: s.isGraphViewDialogOpen,
			toggleGraphViewDialogOpen: s.toggleGraphViewDialogOpen,
			toggleSettingsDialogOpen: s.toggleSettingsDialogOpen,
			toggleNoteInfoOpen: s.toggleNoteInfoOpen,
			zoomIn: s.increaseFontScale,
			zoomOut: s.decreaseFontScale,
			resetZoom: s.resetFontScale,
		})),
	)

	useEffect(() => {
		if (isHotkeysLoaded) {
			return
		}
		void initializeHotkeys()
	}, [initializeHotkeys, isHotkeysLoaded])

	const actionHandlers = useMemo<Record<AppHotkeyActionId, () => void>>(
		() => ({
			"create-note": () => {
				void createAndOpenNote()
			},
			"open-folder": () => {
				void openFolderPicker()
			},
			"open-command-menu": () => {
				toggleCommandMenu()
			},
			"toggle-graph-view": () => {
				if (!workspacePath && !isGraphViewDialogOpen) {
					return
				}
				toggleGraphViewDialogOpen()
			},
			"toggle-file-explorer": () => {
				toggleFileExplorer()
			},
			"toggle-collection-view": () => {
				toggleCollectionView()
			},
			"zoom-in": () => {
				zoomIn()
			},
			"zoom-out": () => {
				zoomOut()
			},
			"reset-zoom": () => {
				resetZoom()
			},
			"go-back": () => {
				void goBack()
			},
			"go-forward": () => {
				void goForward()
			},
			"toggle-settings": () => {
				toggleSettingsDialogOpen()
			},
			"toggle-note-info": () => {
				toggleNoteInfoOpen()
			},
		}),
		[
			createAndOpenNote,
			openFolderPicker,
			toggleCommandMenu,
			workspacePath,
			isGraphViewDialogOpen,
			toggleGraphViewDialogOpen,
			toggleFileExplorer,
			toggleCollectionView,
			zoomIn,
			zoomOut,
			resetZoom,
			goBack,
			goForward,
			toggleSettingsDialogOpen,
			toggleNoteInfoOpen,
		],
	)

	return (
		<>
			{APP_HOTKEY_DEFINITIONS.map((definition) => {
				const binding = hotkeys[definition.id]
				if (!binding) {
					return null
				}
				return (
					<HotkeyBinding
						key={definition.id}
						binding={binding}
						onTrigger={actionHandlers[definition.id]}
					/>
				)
			})}
		</>
	)
}
