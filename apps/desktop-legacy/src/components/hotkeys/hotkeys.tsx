import { useHotkey } from "@tanstack/react-hotkeys"
import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/shallow"
import { closeTabOrHideWindow } from "@/lib/close-tab-or-hide-window"
import {
	getDesktopRuntime,
	useDesktopRuntime,
	useDocumentState,
	useHotkeysState,
	useWindowState,
} from "@/state"
import {
	APP_HOTKEY_DEFINITIONS,
	type AppHotkeyActionId,
	FIXED_TAB_SHORTCUT_DIGITS,
} from "@/state/services/hotkeys"

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
	const hotkeys = useHotkeysState((s) => s.hotkeys)
	const { createAndOpenNote, openFolderPicker, toggleCollectionView } =
		useDesktopRuntime().workspace.commands
	const activeTabId = useDocumentState((s) => s.activeTabId)
	const { isEditMode, chatPanelBetaEnabled } = useWindowState(
		useShallow((s) => ({
			isEditMode: s.isEditMode,
			chatPanelBetaEnabled: s.chatPanelBetaEnabled,
		})),
	)
	const {
		closeActiveTab,
		activateTabById,
		activatePreviousTab,
		activateNextTab,
		goBack,
		goForward,
	} = useDesktopRuntime().documents.commands
	const {
		toggleFileExplorerOpen: toggleFileExplorer,
		toggleCommandMenu,
		toggleSettingsDialogOpen,
		toggleNoteInfoOpen,
		toggleChatPanelOpen,
		increaseFontScale: zoomIn,
		decreaseFontScale: zoomOut,
		resetFontScale: resetZoom,
	} = useDesktopRuntime().window.commands

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
				getDesktopRuntime().documents.getSnapshot().tabs,
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
