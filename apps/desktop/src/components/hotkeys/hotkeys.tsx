import {
	APP_HOTKEY_DEFINITIONS,
	type AppHotkeyActionId,
	FIXED_TAB_SHORTCUT_DIGITS,
} from "@mdit/store/hotkeys"
import { useHotkey } from "@tanstack/react-hotkeys"
import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/shallow"
import { closeTabOrHideWindow } from "@/lib/close-tab-or-hide-window"
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

export function getTabIdForNumberShortcut<T extends { id: number }>(
	tabs: readonly T[],
	digit: number,
): number | null {
	if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
		return null
	}

	return tabs[digit - 1]?.id ?? null
}

export function Hotkeys() {
	const {
		hotkeys,
		createAndOpenNote,
		activeTabId,
		isEditMode,
		closeActiveTab,
		openFolderPicker,
		activateTabById,
		activatePreviousTab,
		activateNextTab,
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
		chatPanelBetaEnabled,
		toggleChatPanelOpen,
		zoomIn,
		zoomOut,
		resetZoom,
	} = useStore(
		useShallow((s) => ({
			hotkeys: s.hotkeys,
			createAndOpenNote: s.createAndOpenNote,
			activeTabId: s.activeTabId,
			isEditMode: s.isEditMode,
			closeActiveTab: s.closeActiveTab,
			openFolderPicker: s.openFolderPicker,
			activateTabById: s.activateTabById,
			activatePreviousTab: s.activatePreviousTab,
			activateNextTab: s.activateNextTab,
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
			chatPanelBetaEnabled: s.chatPanelBetaEnabled,
			toggleChatPanelOpen: s.toggleChatPanelOpen,
			zoomIn: s.increaseFontScale,
			zoomOut: s.decreaseFontScale,
			resetZoom: s.resetFontScale,
		})),
	)

	const handleCloseTab = useCallback(() => {
		void closeTabOrHideWindow({
			isEditMode,
			hasActiveTab: activeTabId !== null,
			closeActiveTab,
		})
	}, [activeTabId, closeActiveTab, isEditMode])

	const handleActivateTabByNumber = useCallback(
		(digit: number) => {
			const targetTabId = getTabIdForNumberShortcut(
				useStore.getState().tabs,
				digit,
			)
			if (targetTabId === null) {
				return
			}

			activateTabById(targetTabId)
		},
		[activateTabById],
	)

	const actionHandlers = useMemo<Record<AppHotkeyActionId, () => void>>(
		() => ({
			"create-note": () => {
				void createAndOpenNote()
			},
			"close-tab": handleCloseTab,
			"open-folder": () => {
				void openFolderPicker()
			},
			"previous-tab": () => {
				activatePreviousTab()
			},
			"next-tab": () => {
				activateNextTab()
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
			"toggle-chat-panel": () => {
				if (!chatPanelBetaEnabled) {
					return
				}

				toggleChatPanelOpen()
			},
		}),
		[
			createAndOpenNote,
			handleCloseTab,
			openFolderPicker,
			activatePreviousTab,
			activateNextTab,
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
			chatPanelBetaEnabled,
			toggleChatPanelOpen,
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
			{FIXED_TAB_SHORTCUT_DIGITS.map((digit) => (
				<HotkeyBinding
					key={`fixed-tab-shortcut-${digit}`}
					binding={`Mod+${digit}`}
					onTrigger={() => handleActivateTabByNumber(digit)}
				/>
			))}
		</>
	)
}
